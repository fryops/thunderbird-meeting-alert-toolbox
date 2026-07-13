/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionCommon: { ExtensionAPI, EventManager } } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
var { ExtensionUtils: { ExtensionError } } = ChromeUtils.importESModule("resource://gre/modules/ExtensionUtils.sys.mjs");

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

function extensionErrorMessage(error) {
  if (error == null) return "unknown error";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  try {
    return String(error);
  } catch {
    return "unknown error";
  }
}

function registerExperimentResources(extension) {
  const root = `experiments-calendar-${extension.uuid}`;
  Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler)
    .setSubstitution(root, extension.rootURI);
  return root;
}

function unregisterExperimentResources(extension) {
  const root = `experiments-calendar-${extension.uuid}`;
  Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler)
    .setSubstitution(root, null);
}

function toJsDate(calDate) {
  if (!calDate) return null;
  try {
    // nativeTime is microseconds since the Unix epoch.
    return new Date(calDate.nativeTime / 1000);
  } catch {
    return null;
  }
}

function toIcalUtc(date) {
  const pad = n => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function alarmIsDue(item, sinceMs, untilMs) {
  const alarms = item.getAlarms?.() ?? [];
  if (alarms.length === 0) {
    // Match ReminderWatcher ICS fallback: start-15m and start.
    const start = toJsDate(item.startDate);
    if (!start) return false;
    const candidates = [start.getTime() - 15 * 60_000, start.getTime()];
    return candidates.some(t => t > sinceMs && t <= untilMs);
  }

  for (const alarm of alarms) {
    let alarmDate;
    try {
      alarmDate = cal.alarms.calculateAlarmDate(item, alarm);
    } catch {
      continue;
    }
    const fireAt = toJsDate(alarmDate);
    if (!fireAt) continue;
    const t = fireAt.getTime();
    if (t > sinceMs && t <= untilMs) return true;
  }
  return false;
}

this.calendar_items = class extends ExtensionAPI {
  onStartup() {
    const root = registerExperimentResources(this.extension);
    console.info(
      `[meeting-reminder-join] calendar.items onStartup v${this.extension.manifest.version} resource://${root}/`
    );
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) return;
    try {
      unregisterExperimentResources(this.extension);
    } catch {
      // ignore
    }
  }

  getAPI(context) {
    const uuid = context.extension.uuid;
    const root = registerExperimentResources(context.extension);
    const query = context.extension.manifest.version;
    console.info(
      `[meeting-reminder-join] calendar.items getAPI v${query}`
    );
    const {
      createCalendarObserver,
      getResolvedCalendarById,
      getCachedCalendar,
      isCachedCalendar,
      isOwnCalendar,
      propsToItem,
      convertItem,
      convertAlarm,
    } = ChromeUtils.importESModule(
      `resource://${root}/experiments/calendar/ext-calendar-utils.sys.mjs?${query}`
    );

    return {
      calendar: {
        items: {
          async ping() {
            return {
              ok: true,
              version: query,
              api: "calendar.items",
              build: "due-v1",
            };
          },

          /**
           * Parent-side due-reminder scan. Returns only due events with small
           * IPC payloads (avoids shipping every calendar ICS into the extension).
           */
          async findDueReminders(props = {}) {
            try {
              const sinceMs = Date.parse(props.since ?? "") || Date.now() - 60_000;
              const untilMs = Date.parse(props.until ?? "") || Date.now() + 15_000;
              const rangeStartIcal =
                props.rangeStart || toIcalUtc(new Date(sinceMs - 2 * 60 * 60_000));
              const rangeEndIcal =
                props.rangeEnd || toIcalUtc(new Date(untilMs + 8 * 60 * 60_000));

              const filter =
                Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL |
                Ci.calICalendar.ITEM_FILTER_TYPE_EVENT |
                Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;

              const calendars = cal.manager
                .getCalendars()
                .filter(calendar => {
                  try {
                    return !calendar.getProperty("disabled");
                  } catch {
                    return true;
                  }
                });

              const dueItems = [];
              for (const calendar of calendars) {
                let items = [];
                try {
                  const start = cal.createDateTime(rangeStartIcal);
                  const end = cal.createDateTime(rangeEndIcal);
                  items = await calendar.getItemsAsArray(filter, 0, start, end);
                } catch (error) {
                  console.warn(
                    `[meeting-reminder-join] findDueReminders skipped ${calendar?.id}:`,
                    extensionErrorMessage(error)
                  );
                  continue;
                }

                for (const item of items || []) {
                  if (!item?.isEvent?.() || !alarmIsDue(item, sinceMs, untilMs)) {
                    continue;
                  }
                  try {
                    const converted = convertItem(
                      item,
                      { returnFormat: "ical" },
                      context.extension
                    );
                    if (converted) {
                      dueItems.push(JSON.parse(JSON.stringify(converted)));
                    }
                  } catch (error) {
                    console.warn(
                      `[meeting-reminder-join] findDueReminders convert failed:`,
                      extensionErrorMessage(error)
                    );
                  }
                }
              }

              console.info(
                `[meeting-reminder-join] findDueReminders done v${query}`,
                { dueCount: dueItems.length, calendarCount: calendars.length }
              );
              return dueItems;
            } catch (error) {
              if (error instanceof ExtensionError) throw error;
              throw new ExtensionError(
                `findDueReminders failed: ${extensionErrorMessage(error)}`
              );
            }
          },

          async query(queryProps = {}) {
            try {
              let calendars = [];
              if (typeof queryProps.calendarId == "string") {
                calendars = [
                  getResolvedCalendarById(context.extension, queryProps.calendarId),
                ];
              } else if (Array.isArray(queryProps.calendarId)) {
                calendars = queryProps.calendarId.map(calendarId =>
                  getResolvedCalendarById(context.extension, calendarId)
                );
              } else {
                calendars = cal.manager.getCalendars().filter(calendar => {
                  try {
                    return !calendar.getProperty("disabled");
                  } catch {
                    return true;
                  }
                });
              }

              console.info(
                `[meeting-reminder-join] calendar.items.query start v${query}`,
                {
                  calendarCount: calendars.length,
                  type: queryProps.type ?? null,
                  expand: queryProps.expand ?? null,
                  rangeStart: queryProps.rangeStart ?? null,
                  rangeEnd: queryProps.rangeEnd ?? null,
                }
              );

              const rawItems = [];
              if (queryProps.id) {
                for (const calendar of calendars) {
                  try {
                    const item = await calendar.getItem(queryProps.id);
                    if (item) rawItems.push(item);
                  } catch (error) {
                    console.warn(
                      `[meeting-reminder-join] getItem failed for ${calendar?.id ?? "?"}:`,
                      extensionErrorMessage(error)
                    );
                  }
                }
              } else {
                // Range queries need occurrence expansion or recurring events are
                // skipped / mishandled. Always expand when a range is provided.
                const expand =
                  queryProps.expand ||
                  Boolean(queryProps.rangeStart || queryProps.rangeEnd);

                let filter = Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
                if (queryProps.type == "event") {
                  filter |= Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
                } else if (queryProps.type == "task") {
                  filter |= Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
                } else {
                  filter |= Ci.calICalendar.ITEM_FILTER_TYPE_ALL;
                }
                if (expand) {
                  filter |= Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
                }

                // Process calendars sequentially with fresh date instances.
                // Shared calIDateTime objects mutated by providers can break
                // parallel getItemsAsArray calls.
                for (const calendar of calendars) {
                  let rangeStart = null;
                  let rangeEnd = null;
                  try {
                    rangeStart = queryProps.rangeStart
                      ? cal.createDateTime(queryProps.rangeStart)
                      : null;
                    rangeEnd = queryProps.rangeEnd
                      ? cal.createDateTime(queryProps.rangeEnd)
                      : null;
                  } catch (error) {
                    throw new ExtensionError(
                      `Invalid calendar.items.query range: ${extensionErrorMessage(error)}`
                    );
                  }

                  try {
                    const items = await calendar.getItemsAsArray(
                      filter,
                      queryProps.limit ?? 0,
                      rangeStart,
                      rangeEnd
                    );
                    if (Array.isArray(items)) {
                      rawItems.push(...items);
                    }
                  } catch (error) {
                    console.warn(
                      `[meeting-reminder-join] skipped calendar ${calendar?.id ?? "?"} (${calendar?.name ?? "?"}):`,
                      extensionErrorMessage(error)
                    );
                  }
                }
              }

              const results = [];
              for (const item of rawItems) {
                if (!item) continue;
                try {
                  const converted = convertItem(
                    item,
                    queryProps,
                    context.extension
                  );
                  if (!converted) continue;
                  // Ensure structured-clone / IPC safe plain data.
                  results.push(JSON.parse(JSON.stringify(converted)));
                } catch (error) {
                  console.warn(
                    `[meeting-reminder-join] convertItem failed for ${item?.id ?? "?"}:`,
                    extensionErrorMessage(error)
                  );
                }
              }

              console.info(
                `[meeting-reminder-join] calendar.items.query done v${query}`,
                { itemCount: results.length }
              );
              return results;
            } catch (error) {
              if (error instanceof ExtensionError) {
                throw error;
              }
              const message = extensionErrorMessage(error);
              console.error(
                `[meeting-reminder-join] calendar.items.query fatal:`,
                message,
                error
              );
              throw new ExtensionError(`calendar.items.query failed: ${message}`);
            }
          },
          async get(calendarId, id, options) {
            const calendar = getResolvedCalendarById(context.extension, calendarId);
            const item = await calendar.getItem(id);
            return convertItem(item, options, context.extension);
          },
          async create(calendarId, createProperties) {
            const calendar = getResolvedCalendarById(context.extension, calendarId);
            const item = propsToItem(createProperties);
            item.calendar = calendar.superCalendar;

            if (createProperties.metadata && isOwnCalendar(calendar, context.extension)) {
              const cache = getCachedCalendar(calendar);
              cache.setMetaData(item.id, JSON.stringify(createProperties.metadata));
            }

            let createdItem;
            if (isCachedCalendar(calendarId)) {
              createdItem = await calendar.modifyItem(item, null);
            } else {
              createdItem = await calendar.adoptItem(item);
            }

            return convertItem(createdItem, createProperties, context.extension);
          },
          async update(calendarId, id, updateProperties) {
            const calendar = getResolvedCalendarById(context.extension, calendarId);

            const oldItem = await calendar.getItem(id);
            if (!oldItem) {
              throw new ExtensionError("Could not find item " + id);
            }
            if (oldItem.isEvent()) {
              updateProperties.type = "event";
            } else if (oldItem.isTodo()) {
              updateProperties.type = "task";
            } else {
              throw new ExtensionError(`Encountered unknown item type for ${calendarId}/${id}`);
            }

            const newItem = propsToItem(updateProperties);
            newItem.calendar = calendar.superCalendar;

            if (updateProperties.metadata && isOwnCalendar(calendar, context.extension)) {
              // TODO merge or replace?
              const cache = getCachedCalendar(calendar);
              cache.setMetaData(newItem.id, JSON.stringify(updateProperties.metadata));
            }

            const modifiedItem = await calendar.modifyItem(newItem, oldItem);
            return convertItem(modifiedItem, updateProperties, context.extension);
          },
          async move(fromCalendarId, id, toCalendarId) {
            if (fromCalendarId == toCalendarId) {
              return;
            }

            const fromCalendar = cal.manager.getCalendarById(fromCalendarId);
            const toCalendar = cal.manager.getCalendarById(toCalendarId);
            const item = await fromCalendar.getItem(id);

            if (!item) {
              throw new ExtensionError("Could not find item " + id);
            }

            if (isOwnCalendar(toCalendar, context.extension) && isOwnCalendar(fromCalendar, context.extension)) {
              // TODO doing this first, the item may not be in the db and it will fail. Doing this
              // after addItem, the metadata will not be available for the onCreated listener
              const fromCache = getCachedCalendar(fromCalendar);
              const toCache = getCachedCalendar(toCalendar);
              toCache.setMetaData(item.id, fromCache.getMetaData(item.id));
            }
            await toCalendar.addItem(item);
            await fromCalendar.deleteItem(item);
          },
          async remove(calendarId, id) {
            const calendar = getResolvedCalendarById(context.extension, calendarId);

            const item = await calendar.getItem(id);
            if (!item) {
              throw new ExtensionError("Could not find item " + id);
            }
            await calendar.deleteItem(item);
          },

          async getCurrent(options) {
            try {
              // TODO This seems risky, could be null depending on remoteness
              const item = context.browsingContext.embedderElement.ownerGlobal.calendarItem;
              return convertItem(item, options, context.extension);
            } catch (e) {
              console.error(e);
              return null;
            }
          },

          onCreated: new EventManager({
            context,
            name: "calendar.items.onCreated",
            register: (fire, options) => {
              const observer = createCalendarObserver({
                onAddItem: item => {
                  fire.sync(convertItem(item, options, context.extension));
                },
              });

              cal.manager.addCalendarObserver(observer);
              return () => {
                cal.manager.removeCalendarObserver(observer);
              };
            },
          }).api(),

          onUpdated: new EventManager({
            context,
            name: "calendar.items.onUpdated",
            register: (fire, options) => {
              const observer = createCalendarObserver({
                onModifyItem: (newItem, _oldItem) => {
                  // TODO calculate changeInfo
                  const changeInfo = {};
                  fire.sync(convertItem(newItem, options, context.extension), changeInfo);
                },
              });

              cal.manager.addCalendarObserver(observer);
              return () => {
                cal.manager.removeCalendarObserver(observer);
              };
            },
          }).api(),

          onRemoved: new EventManager({
            context,
            name: "calendar.items.onRemoved",
            register: fire => {
              const observer = createCalendarObserver({
                onDeleteItem: item => {
                  fire.sync(item.calendar.id, item.id);
                },
              });

              cal.manager.addCalendarObserver(observer);
              return () => {
                cal.manager.removeCalendarObserver(observer);
              };
            },
          }).api(),

          onAlarm: new EventManager({
            context,
            name: "calendar.items.onAlarm",
            register: (fire, options) => {
              const observer = {
                QueryInterface: ChromeUtils.generateQI(["calIAlarmServiceObserver"]),
                onAlarm(item, alarm) {
                  fire.sync(convertItem(item, options, context.extension), convertAlarm(item, alarm));
                },
                onRemoveAlarmsByItem(_item) {},
                onRemoveAlarmsByCalendar(_calendar) {},
                onAlarmsLoaded(_calendar) {},
              };

              const alarmsvc = Cc["@mozilla.org/calendar/alarm-service;1"].getService(
                Ci.calIAlarmService
              );

              alarmsvc.addObserver(observer);
              return () => {
                alarmsvc.removeObserver(observer);
              };
            },
          }).api(),
        },
      },
    };
  }
};
