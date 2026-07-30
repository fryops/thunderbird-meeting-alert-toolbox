import { describe, expect, it, vi } from "vitest";
import { DetectMeetingLink } from "../../src/application/detect-meeting-link.js";
import { HandleReminder } from "../../src/application/handle-reminder.js";
import { ResolveReminderAction } from "../../src/application/resolve-reminder-action.js";
import { FakeCalendarRepository } from "../../src/adapters/fake/fake-calendar-repository.js";
import { FakeReminderPresenter } from "../../src/adapters/fake/fake-reminder-presenter.js";
import { FakeReminderPresentationStore } from "../../src/adapters/fake/fake-reminder-presentation-store.js";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../../src/domain/providers/index.js";
import type { NativeAlarmSuppressor } from "../../src/ports/native-alarm-suppressor.js";
import type { ReminderPresentationStore } from "../../src/ports/reminder-presentation-store.js";

function createHandleReminder(
  calendar: FakeCalendarRepository,
  presenter: FakeReminderPresenter,
  options: {
    nativeAlarms?: NativeAlarmSuppressor;
    store?: ReminderPresentationStore;
  } = {},
): HandleReminder {
  return new HandleReminder(
    calendar,
    new DetectMeetingLink(new MeetingProviderRegistry(createDefaultProviders())),
    new ResolveReminderAction(),
    presenter,
    options.store ?? new FakeReminderPresentationStore(),
    options.nativeAlarms,
  );
}

describe("HandleReminder", () => {
  it("presents an action when a meeting link exists", async () => {
    const calendar = new FakeCalendarRepository([
      {
        id: "e1",
        title: "Sync",
        start: new Date("2026-07-10T20:00:00Z"),
        location: "https://meet.google.com/abc-defg-hij",
      },
    ]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);

    await handle.execute("e1");

    expect(presenter.presented).toHaveLength(1);
    expect(presenter.presented[0]?.primary.providerId).toBe("google-meet");
    expect(presenter.hiddenCalls).toBe(0);
  });

  it("stays silent when no meeting link exists without closing an open companion", async () => {
    const calendar = new FakeCalendarRepository([
      {
        id: "e2",
        title: "Focus time",
        start: new Date("2026-07-10T20:00:00Z"),
        location: "Conference Room A",
      },
    ]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);

    await handle.execute("e2");

    expect(presenter.presented).toHaveLength(0);
    expect(presenter.hiddenCalls).toBe(0);
  });

  it("does not close a meeting companion when a later non-meeting due event is handled", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);

    await handle.executeFromEvent({
      id: "meeting",
      title: "Standup",
      start: new Date("2026-07-10T20:00:00Z"),
      location: "https://meet.google.com/abc-defg-hij",
    });
    await handle.executeFromEvent({
      id: "focus",
      title: "Focus time",
      start: new Date("2026-07-10T20:00:00Z"),
      location: "Conference Room A",
    });

    expect(presenter.presented).toHaveLength(1);
    expect(presenter.hiddenCalls).toBe(0);
  });

  it("stays silent when the event is missing", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);

    await handle.execute("missing");

    expect(presenter.presented).toHaveLength(0);
    expect(presenter.hiddenCalls).toBe(0);
  });

  it("logs and stays silent on event load failures", async () => {
    const calendar = new FakeCalendarRepository([], { failOnGet: true });
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(handle.execute("e1")).resolves.toBeUndefined();
    expect(presenter.presented).toHaveLength(0);
    expect(presenter.hiddenCalls).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      "Unable to load calendar event for reminder",
      expect.objectContaining({ eventId: "e1" }),
    );
    warn.mockRestore();
  });

  it("presents from a preloaded event without reading the calendar again", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);

    await handle.executeFromEvent({
      id: "preloaded",
      title: "Preloaded Sync",
      start: new Date("2026-07-10T20:00:00Z"),
      location: "https://zoom.us/j/999",
    });

    expect(presenter.presented).toHaveLength(1);
    expect(presenter.presented[0]?.primary.providerId).toBe("zoom");
  });

  it("dedupes invite copies and onAlarm/poll races for the same meeting URL+start", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const suppressed: string[] = [];
    const handle = createHandleReminder(calendar, presenter, {
      nativeAlarms: {
        suppressForEvent: async (event) => {
          suppressed.push(event.id);
        },
      },
    });

    const start = new Date("2026-07-10T20:00:00Z");
    const url = "https://zoom.us/j/555";

    await handle.executeFromEvent({
      id: "calendar-a",
      calendarId: "cal-a",
      title: "Zoom Invite",
      start,
      location: url,
    });
    await handle.executeFromEvent({
      id: "calendar-b",
      calendarId: "cal-b",
      title: "Zoom Invite",
      start,
      location: url,
    });
    await handle.executeFromEvent({
      id: "calendar-a",
      calendarId: "cal-a",
      title: "Zoom Invite",
      start,
      location: url,
    });

    expect(presenter.presented).toHaveLength(1);
    expect(suppressed).toEqual(["calendar-a", "calendar-b", "calendar-a"]);
  });

  it("skips re-present after a successful show, including across HandleReminder restarts", async () => {
    const calendar = new FakeCalendarRepository([]);
    const store = new FakeReminderPresentationStore();
    const firstPresenter = new FakeReminderPresenter();
    const first = createHandleReminder(calendar, firstPresenter, { store });

    const event = {
      id: "standup",
      title: "Standup",
      start: new Date("2026-07-10T20:00:00Z"),
      location: "https://zoom.us/j/777",
    };

    await first.executeFromEvent(event);
    expect(firstPresenter.presented).toHaveLength(1);

    const secondPresenter = new FakeReminderPresenter();
    const second = createHandleReminder(calendar, secondPresenter, { store });
    await second.executeFromEvent(event);

    expect(secondPresenter.presented).toHaveLength(0);
  });

  it("still presents a never-handled meeting after it has started", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);

    await handle.executeFromEvent({
      id: "late",
      title: "Late catch-up",
      start: new Date(Date.now() - 60_000),
      location: "https://meet.google.com/abc-defg-hij",
    });

    expect(presenter.presented).toHaveLength(1);
  });

  it("treats different start times as independent occurrences", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const handle = createHandleReminder(calendar, presenter);
    const url = "https://zoom.us/j/888";

    await handle.executeFromEvent({
      id: "week-1",
      title: "Weekly",
      start: new Date("2026-07-10T20:00:00Z"),
      location: url,
    });
    await handle.executeFromEvent({
      id: "week-2",
      title: "Weekly",
      start: new Date("2026-07-17T20:00:00Z"),
      location: url,
    });

    expect(presenter.presented).toHaveLength(2);
  });

  it("does not mark handled when present throws, so a retry can show", async () => {
    const calendar = new FakeCalendarRepository([]);
    const store = new FakeReminderPresentationStore();
    const failing = new FakeReminderPresenter();
    failing.present = async () => {
      throw new Error("window create failed");
    };
    const first = createHandleReminder(calendar, failing, { store });
    const event = {
      id: "retry",
      title: "Retry me",
      start: new Date("2026-07-10T20:00:00Z"),
      location: "https://zoom.us/j/999",
    };

    await expect(first.executeFromEvent(event)).rejects.toThrow("window create failed");

    const presenter = new FakeReminderPresenter();
    const second = createHandleReminder(calendar, presenter, { store });
    await second.executeFromEvent(event);
    expect(presenter.presented).toHaveLength(1);
  });
});
