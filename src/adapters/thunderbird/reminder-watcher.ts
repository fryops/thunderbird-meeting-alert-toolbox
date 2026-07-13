import type { HandleReminder } from "../../application/handle-reminder.js";
import { mapThunderbirdEvent } from "./calendar-repository.js";
import { alarmsDueBetween, parseIcsAlarmFires } from "./parse-ics-alarms.js";

type AlarmApi = {
  create?: (name: string, info: { periodInMinutes?: number; delayInMinutes?: number; when?: number }) => Promise<void>;
  clear?: (name: string) => Promise<boolean>;
  onAlarm?: {
    addListener?: (listener: (alarm: { name: string }) => void) => void;
  };
};

type CalendarItemsApi = {
  ping?: () => Promise<unknown>;
  findDueReminders?: (props: {
    since?: string;
    until?: string;
    rangeStart?: string;
    rangeEnd?: string;
  }) => Promise<unknown>;
  query?: (props: {
    type?: "event" | "task";
    rangeStart?: string;
    rangeEnd?: string;
    expand?: boolean;
    returnFormat?: "ical" | "jcal";
  }) => Promise<unknown>;
};

export type ReminderWatcherApi = {
  alarms?: AlarmApi;
  calendar?: { items?: CalendarItemsApi };
};

const POLL_ALARM_NAME = "meeting-reminder-join-poll";
const POLL_MINUTES = 1;

/**
 * MV3 background pages sleep and can drop calendar.items.onAlarm observers.
 * This watcher wakes periodically via browser.alarms and checks for due meeting reminders.
 */
export class ReminderWatcher {
  private lastPollAt = new Date(Date.now() - 60_000);
  private readonly presentedKeys = new Set<string>();

  constructor(
    private readonly api: ReminderWatcherApi,
    private readonly handleReminder: HandleReminder,
  ) {}

  async start(): Promise<void> {
    const alarms = this.api.alarms;
    if (!alarms?.create || !alarms.onAlarm?.addListener) {
      console.warn("browser.alarms API unavailable; reminder polling disabled");
      return;
    }

    alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== POLL_ALARM_NAME) return;
      void this.poll("alarm");
    });

    await alarms.clear?.(POLL_ALARM_NAME);
    await alarms.create(POLL_ALARM_NAME, { periodInMinutes: POLL_MINUTES });
    console.info("ReminderWatcher started", { periodInMinutes: POLL_MINUTES });
    await this.poll("startup");
  }

  async poll(reason: string): Promise<void> {
    const itemsApi = this.api.calendar?.items;
    if (!itemsApi) {
      console.warn("ReminderWatcher: calendar.items unavailable", { reason });
      return;
    }

    if (itemsApi.ping) {
      try {
        const info = await itemsApi.ping();
        console.info("ReminderWatcher ping", info);
      } catch (error) {
        console.error("ReminderWatcher ping failed — experiment parent may be stale; quit Thunderbird and relaunch with -purgecaches", {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      console.error(
        "ReminderWatcher: calendar.items.ping missing — quit Thunderbird completely and relaunch with -purgecaches so experiment APIs reload.",
      );
    }

    const now = new Date();
    const from = this.lastPollAt;
    const to = new Date(now.getTime() + 15_000);

    let list: unknown[] = [];
    let source = "none";

    if (itemsApi.findDueReminders) {
      try {
        const due = await itemsApi.findDueReminders({
          since: from.toISOString(),
          until: to.toISOString(),
          rangeStart: toIcalUtc(new Date(now.getTime() - 2 * 60 * 60_000)),
          rangeEnd: toIcalUtc(new Date(now.getTime() + 8 * 60 * 60_000)),
        });
        list = Array.isArray(due) ? due : [];
        source = "findDueReminders";
      } catch (error) {
        console.error("ReminderWatcher findDueReminders failed", {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (itemsApi.query) {
      console.warn("ReminderWatcher: findDueReminders missing; falling back to query");
      try {
        const items = await itemsApi.query({
          type: "event",
          rangeStart: toIcalUtc(new Date(now.getTime() - 2 * 60 * 60_000)),
          rangeEnd: toIcalUtc(new Date(now.getTime() + 8 * 60 * 60_000)),
          expand: true,
          returnFormat: "ical",
        });
        list = Array.isArray(items) ? items : [];
        source = "query";
      } catch (error) {
        console.error("ReminderWatcher query failed", {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    } else {
      console.warn("ReminderWatcher: no calendar read API available", { reason });
      return;
    }

    let dueCount = 0;
    for (const raw of list) {
      if (!isRecord(raw) || typeof raw.item !== "string") continue;
      const mapped = mapThunderbirdEvent(raw);
      if (!mapped) continue;

      // Parent findDueReminders already selected due items; query fallback
      // still needs ICS alarm-window checks.
      const dueFires =
        source === "findDueReminders"
          ? [{ at: now }]
          : alarmsDueBetween(parseIcsAlarmFires(raw.item, now), from, to);
      if (dueFires.length === 0) continue;

      for (const fire of dueFires) {
        // findDueReminders can return the same event on later polls; debounce per event.
        const key =
          source === "findDueReminders"
            ? `${mapped.id}:findDue`
            : `${mapped.id}:${fire.at.toISOString()}`;
        if (this.presentedKeys.has(key)) continue;
        this.presentedKeys.add(key);
        dueCount += 1;
        console.info("ReminderWatcher due meeting reminder", {
          reason,
          source,
          eventId: mapped.id,
          title: mapped.title,
          alarmAt: fire.at.toISOString(),
        });
        try {
          await this.handleReminder.executeFromEvent(mapped);
        } catch (error) {
          console.error("ReminderWatcher present failed", error);
        }
      }
    }

    this.lastPollAt = now;
    this.prunePresentedKeys(now);
    console.info("ReminderWatcher poll complete", {
      reason,
      source,
      itemCount: list.length,
      dueCount,
    });
  }

  private prunePresentedKeys(now: Date): void {
    const cutoff = now.getTime() - 6 * 60 * 60_000;
    for (const key of this.presentedKeys) {
      const iso = key.split(":").slice(1).join(":");
      const at = Date.parse(iso);
      if (!Number.isNaN(at) && at < cutoff) this.presentedKeys.delete(key);
    }
  }
}

function toIcalUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
