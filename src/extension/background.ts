import { createApp } from "../composition/root.js";
import { mapThunderbirdEvent } from "../adapters/thunderbird/calendar-repository.js";
import { ReminderWatcher } from "../adapters/thunderbird/reminder-watcher.js";

type RuntimeMessage =
  | { type: "handle-reminder"; eventId?: string }
  | { type: "join-meeting"; url: string }
  | { type: "copy-meeting-link"; url: string }
  | { type: "debug-poll-reminders" };

type ExtensionApi = {
  alarms?: {
    create?: (name: string, info: { periodInMinutes?: number; delayInMinutes?: number; when?: number }) => Promise<void>;
    clear?: (name: string) => Promise<boolean>;
    onAlarm?: {
      addListener?: (listener: (alarm: { name: string }) => void) => void;
    };
  };
  calendar?: {
    items?: {
      onAlarm?: {
        addListener?: (
          listener: (item: unknown, alarm: unknown) => void | Promise<void>,
          options?: { returnFormat?: "ical" | "jcal" },
        ) => void;
      };
      get?: (
        calendarId: string,
        itemId: string,
        options?: { returnFormat?: "ical" | "jcal" },
      ) => Promise<unknown>;
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
        returnFormat?: "ical" | "jcal";
      }) => Promise<unknown>;
    };
  };
  notifications?: {
    create?: (id: string, options: NotificationOptions) => Promise<unknown>;
  };
  runtime?: {
    onMessage?: {
      addListener?: (
        listener: (
          message: unknown,
          sender: unknown,
        ) => Promise<unknown> | unknown,
      ) => void;
    };
  };
};

type NotificationOptions = {
  type: "basic";
  title: string;
  message: string;
  iconUrl?: string;
};

declare const browser: ExtensionApi | undefined;
declare const messenger: ExtensionApi | undefined;

const thunderbird = typeof messenger !== "undefined" ? messenger : browser;
if (!thunderbird) {
  throw new Error("Thunderbird extension API is unavailable");
}

const extensionApi = thunderbird;
const app = createApp(extensionApi);
const watcher = new ReminderWatcher(extensionApi, app.handleReminder);

console.info("Meeting Reminder Join background loaded", {
  hasCalendarItemsAlarm: Boolean(extensionApi.calendar?.items?.onAlarm?.addListener),
  hasCalendarItemsQuery: Boolean(extensionApi.calendar?.items?.query),
  hasCalendarItemsPing: Boolean(extensionApi.calendar?.items?.ping),
  hasFindDueReminders: Boolean(extensionApi.calendar?.items?.findDueReminders),
  hasAlarms: Boolean(extensionApi.alarms?.create),
});

registerAlarmListener(extensionApi);
registerRuntimeMessages(extensionApi);
void watcher.start();

function registerAlarmListener(api: ExtensionApi): void {
  const onAlarm = api.calendar?.items?.onAlarm;
  if (!onAlarm?.addListener) {
    console.warn(
      "calendar.items.onAlarm is unavailable; relying on ReminderWatcher polling.",
    );
    return;
  }

  onAlarm.addListener(async (item) => {
    try {
      await handleAlarmItem(api, item);
    } catch (error) {
      console.error("Failed to handle calendar alarm", error);
    }
  }, { returnFormat: "ical" });

  console.info("Listening for calendar.items.onAlarm");
}

async function handleAlarmItem(api: ExtensionApi, item: unknown): Promise<void> {
  let record = isRecord(item) ? item : null;

  if (record && typeof record.item !== "string") {
    const calendarId = firstString(record.calendarId);
    const itemId = firstString(record.id);
    if (calendarId && itemId && api.calendar?.items?.get) {
      const fetched = await api.calendar.items.get(calendarId, itemId, {
        returnFormat: "ical",
      });
      if (isRecord(fetched)) record = fetched;
    }
  }

  if (!record) {
    console.warn("Calendar alarm payload was not a calendar item", item);
    return;
  }

  const mapped = mapThunderbirdEvent(record);
  if (!mapped) {
    console.warn("Unable to map calendar alarm item", record);
    return;
  }

  await app.handleReminder.executeFromEvent(mapped);
}

function registerRuntimeMessages(api: ExtensionApi): void {
  api.runtime?.onMessage?.addListener?.(async (message) => {
    if (!isRuntimeMessage(message)) return undefined;

    if (message.type === "debug-poll-reminders") {
      await watcher.poll("debug-message");
      return { ok: true };
    }

    if (message.type === "handle-reminder") {
      if (message.eventId) {
        await app.handleReminder.execute(message.eventId);
        return { ok: true };
      }

      return { ok: false };
    }

    if (message.type === "join-meeting") {
      return handleJoin(message.url);
    }

    if (message.type === "copy-meeting-link") {
      return handleCopy(message.url);
    }

    return undefined;
  });
}

async function handleJoin(url: string): Promise<{ ok: boolean }> {
  try {
    await app.joinMeeting.execute(url);
    return { ok: true };
  } catch (error) {
    await reportActionFailure("Unable to join meeting", error);
    return { ok: false };
  }
}

async function handleCopy(url: string): Promise<{ ok: boolean }> {
  try {
    await app.copyMeetingLink.execute(url);
    return { ok: true };
  } catch (error) {
    await reportActionFailure("Unable to copy meeting link", error);
    return { ok: false };
  }
}

async function reportActionFailure(title: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const createNotification = extensionApi.notifications?.create;
  if (createNotification) {
    await createNotification(`meeting-reminder-join-${Date.now()}`, {
      type: "basic",
      title,
      message,
      iconUrl: "icons/icon-48.png",
    });
    return;
  }

  console.error(title, error);
}

function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  if (value.type === "debug-poll-reminders") return true;

  if (value.type === "handle-reminder") {
    return value.eventId === undefined || typeof value.eventId === "string";
  }

  return (
    (value.type === "join-meeting" || value.type === "copy-meeting-link") &&
    typeof value.url === "string"
  );
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
