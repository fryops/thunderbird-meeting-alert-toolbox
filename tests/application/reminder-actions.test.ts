import { describe, expect, it } from "vitest";
import { CopyMeetingLink } from "../../src/application/copy-meeting-link.js";
import { JoinMeeting } from "../../src/application/join-meeting.js";
import { ResolveReminderAction } from "../../src/application/resolve-reminder-action.js";
import { FakeBrowserLauncher } from "../../src/adapters/fake/fake-browser-launcher.js";
import { FakeClipboardService } from "../../src/adapters/fake/fake-clipboard-service.js";
import { MeetingDetectionResult } from "../../src/domain/meeting-detection-result.js";
import type { CalendarEventFields } from "../../src/domain/calendar-event-fields.js";

const event: CalendarEventFields = {
  id: "e1",
  title: "Sprint Planning",
  start: new Date("2026-07-10T20:00:00Z"),
  end: new Date("2026-07-10T20:30:00Z"),
};

const detection = MeetingDetectionResult.from([
  {
    providerId: "google-meet",
    displayName: "Google Meet",
    url: "https://meet.google.com/abc-defg-hij",
    icon: "google-meet",
  },
  {
    providerId: "zoom",
    displayName: "Zoom",
    url: "https://zoom.us/j/1",
    icon: "zoom",
  },
]);

describe("ResolveReminderAction", () => {
  it("maps event + detection to a presentable action", () => {
    const action = new ResolveReminderAction().execute(event, detection);
    expect(action).toEqual({
      eventId: "e1",
      title: "Sprint Planning",
      start: event.start,
      end: event.end,
      primary: detection.primary,
      alternatives: detection.alternatives,
    });
  });

  it("returns null when detection is empty", () => {
    expect(
      new ResolveReminderAction().execute(event, MeetingDetectionResult.from([])),
    ).toBeNull();
  });
});

describe("JoinMeeting", () => {
  it("opens the selected url", async () => {
    const browser = new FakeBrowserLauncher();
    await new JoinMeeting(browser).execute("https://meet.google.com/abc-defg-hij");
    expect(browser.opened).toEqual(["https://meet.google.com/abc-defg-hij"]);
  });
});

describe("CopyMeetingLink", () => {
  it("writes the url to the clipboard", async () => {
    const clipboard = new FakeClipboardService();
    await new CopyMeetingLink(clipboard).execute("https://zoom.us/j/1");
    expect(clipboard.texts).toEqual(["https://zoom.us/j/1"]);
  });
});
