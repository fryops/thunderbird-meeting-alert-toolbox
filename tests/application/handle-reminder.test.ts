import { describe, expect, it, vi } from "vitest";
import { DetectMeetingLink } from "../../src/application/detect-meeting-link.js";
import { HandleReminder } from "../../src/application/handle-reminder.js";
import { ResolveReminderAction } from "../../src/application/resolve-reminder-action.js";
import { FakeCalendarRepository } from "../../src/adapters/fake/fake-calendar-repository.js";
import { FakeReminderPresenter } from "../../src/adapters/fake/fake-reminder-presenter.js";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../../src/domain/providers/index.js";
import type { NativeAlarmSuppressor } from "../../src/ports/native-alarm-suppressor.js";

function createHandleReminder(
  calendar: FakeCalendarRepository,
  presenter: FakeReminderPresenter,
  nativeAlarms?: NativeAlarmSuppressor,
  debounceMs?: number,
): HandleReminder {
  return new HandleReminder(
    calendar,
    new DetectMeetingLink(new MeetingProviderRegistry(createDefaultProviders())),
    new ResolveReminderAction(),
    presenter,
    nativeAlarms,
    debounceMs,
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

  it("hides the presenter when no meeting link exists", async () => {
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
    expect(presenter.hiddenCalls).toBe(1);
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
    const handle = createHandleReminder(
      calendar,
      presenter,
      {
        suppressForEvent: async (event) => {
          suppressed.push(event.id);
        },
      },
      60_000,
    );

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
});
