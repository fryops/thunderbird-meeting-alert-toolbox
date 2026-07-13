import { describe, expect, it } from "vitest";
import { DetectMeetingLink } from "../../src/application/detect-meeting-link.js";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../../src/domain/providers/index.js";
import type { CalendarEventFields } from "../../src/domain/calendar-event-fields.js";

function event(partial: Partial<CalendarEventFields>): CalendarEventFields {
  return {
    id: "e1",
    title: "Sync",
    start: new Date("2026-07-10T18:00:00Z"),
    ...partial,
  };
}

describe("DetectMeetingLink", () => {
  const detect = new DetectMeetingLink(
    new MeetingProviderRegistry(createDefaultProviders()),
  );

  it("finds a link in location", () => {
    const result = detect.execute(
      event({ location: "https://meet.google.com/abc-defg-hij" }),
    );
    expect(result.primary?.providerId).toBe("google-meet");
  });

  it("finds a link in HTML description", () => {
    const result = detect.execute(
      event({
        htmlBody:
          '<p>Join <a href="https://zoom.us/j/999">Zoom</a></p>',
      }),
    );
    expect(result.primary?.providerId).toBe("zoom");
  });

  it("returns multiple detections in document order", () => {
    const result = detect.execute(
      event({
        description:
          "Zoom https://zoom.us/j/1 then Meet https://meet.google.com/abc-defg-hij",
      }),
    );
    expect(result.all.map((l) => l.providerId)).toEqual(["zoom", "google-meet"]);
  });

  it("ignores unknown and invalid urls", () => {
    const result = detect.execute(
      event({
        description: "https://example.com/x and https://zoom.us/pricing",
      }),
    );
    expect(result.isEmpty).toBe(true);
  });

  it("dedupes identical normalized urls", () => {
    const result = detect.execute(
      event({
        location: "https://zoom.us/j/1",
        description: "https://zoom.us/j/1",
      }),
    );
    expect(result.all).toHaveLength(1);
  });
});
