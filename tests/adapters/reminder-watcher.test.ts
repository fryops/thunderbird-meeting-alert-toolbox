import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderWatcher } from "../../src/adapters/thunderbird/reminder-watcher.js";
import type { HandleReminder } from "../../src/application/handle-reminder.js";

describe("ReminderWatcher hibernation catch-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T18:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks back far enough on startup to catch reminders missed during sleep", async () => {
    // Wake at 18:00 with a meeting at 18:01. Reminder fired at 17:46 (15m before)
    // during hibernation — outside the old 60s lookback.
    const findDueReminders = vi.fn<(props: {
      since?: string;
      until?: string;
      rangeStart?: string;
      rangeEnd?: string;
    }) => Promise<unknown[]>>(async () => []);
    const handleReminder = {
      executeFromEvent: vi.fn(async () => undefined),
    } as unknown as HandleReminder;

    const watcher = new ReminderWatcher(
      {
        alarms: {
          create: vi.fn(async () => undefined),
          clear: vi.fn(async () => true),
          onAlarm: { addListener: vi.fn() },
        },
        calendar: {
          items: {
            ping: vi.fn(async () => ({ ok: true })),
            findDueReminders,
          },
        },
      },
      handleReminder,
    );

    await watcher.start();

    expect(findDueReminders).toHaveBeenCalled();
    const props = findDueReminders.mock.calls[0]?.[0];
    expect(props).toBeDefined();
    const sinceMs = Date.parse(props?.since ?? "");
    const untilMs = Date.parse(props?.until ?? "");
    const reminderAt = Date.parse("2026-07-22T17:46:00Z");
    const now = Date.parse("2026-07-22T18:00:00Z");
    const meetingStart = Date.parse("2026-07-22T18:01:00Z");

    expect(meetingStart - now).toBe(60_000);
    expect(sinceMs).toBeLessThan(reminderAt);
    expect(now - sinceMs).toBeGreaterThanOrEqual(15 * 60_000);
    expect(untilMs).toBeGreaterThan(now);
  });

  it("presents a query-fallback reminder that fired ~14 minutes ago", async () => {
    const ics = `BEGIN:VEVENT
UID:sleep-miss
SUMMARY:Standup
LOCATION:https://meet.google.com/abc-defg-hij
DTSTART:20260722T180100Z
DTEND:20260722T183000Z
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT15M
END:VALARM
END:VEVENT`;

    const executeFromEvent = vi.fn<(event: { id: string; title: string }) => Promise<void>>(
      async () => undefined,
    );
    const handleReminder = { executeFromEvent } as unknown as HandleReminder;

    const watcher = new ReminderWatcher(
      {
        alarms: {
          create: vi.fn(async () => undefined),
          clear: vi.fn(async () => true),
          onAlarm: { addListener: vi.fn() },
        },
        calendar: {
          items: {
            ping: vi.fn(async () => ({ ok: true })),
            query: vi.fn(async () => [
              {
                id: "sleep-miss",
                calendarId: "cal-1",
                title: "Standup",
                item: ics,
              },
            ]),
          },
        },
      },
      handleReminder,
    );

    await watcher.poll("startup");

    expect(executeFromEvent).toHaveBeenCalledTimes(1);
    expect(executeFromEvent.mock.calls[0]?.[0]).toMatchObject({
      id: "sleep-miss",
      title: "Standup",
    });
  });

  it("reuses persisted lastPollAt so a background restart does not re-scan 30 minutes", async () => {
    const storageData: Record<string, unknown> = {
      reminderWatcherLastPollAt: "2026-07-22T17:59:00.000Z",
    };
    const findDueReminders = vi.fn<(props: {
      since?: string;
      until?: string;
    }) => Promise<unknown[]>>(async () => []);
    const handleReminder = {
      executeFromEvent: vi.fn(async () => undefined),
    } as unknown as HandleReminder;

    const watcher = new ReminderWatcher(
      {
        alarms: {
          create: vi.fn(async () => undefined),
          clear: vi.fn(async () => true),
          onAlarm: { addListener: vi.fn() },
        },
        storage: {
          local: {
            get: async (keys) => {
              const key = typeof keys === "string" ? keys : "";
              return key in storageData ? { [key]: storageData[key] } : {};
            },
            set: async (items) => {
              Object.assign(storageData, items);
            },
          },
        },
        calendar: {
          items: {
            ping: vi.fn(async () => ({ ok: true })),
            findDueReminders,
          },
        },
      },
      handleReminder,
    );

    await watcher.start();

    const sinceMs = Date.parse(findDueReminders.mock.calls[0]?.[0]?.since ?? "");
    expect(sinceMs).toBe(Date.parse("2026-07-22T17:59:00.000Z"));
    expect(storageData.reminderWatcherLastPollAt).toBe("2026-07-22T18:00:00.000Z");
  });
});
