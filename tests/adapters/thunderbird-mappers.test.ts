import { describe, expect, it } from "vitest";
import { mapThunderbirdEvent } from "../../src/adapters/thunderbird/calendar-repository.js";

describe("mapThunderbirdEvent", () => {
  it("maps common Thunderbird calendar item fields to domain event fields", () => {
    const event = mapThunderbirdEvent({
      id: "item-1",
      title: "Sprint Planning",
      startDate: "2026-07-10T20:00:00Z",
      endDate: "2026-07-10T20:30:00Z",
      location: "Room 4, https://meet.google.com/abc-defg-hij",
      description: "Agenda and notes",
    });

    expect(event).toEqual({
      id: "item-1",
      title: "Sprint Planning",
      start: new Date("2026-07-10T20:00:00Z"),
      end: new Date("2026-07-10T20:30:00Z"),
      location: "Room 4, https://meet.google.com/abc-defg-hij",
      description: "Agenda and notes",
    });
  });

  it("maps nested date and body variants exposed by calendar experiments", () => {
    const event = mapThunderbirdEvent({
      uid: "uid-2",
      summary: "Design Review",
      start: { dateTime: "2026-07-10T21:00:00Z" },
      end: { dateTime: "2026-07-10T22:00:00Z" },
      body: { plain: "Plain body", html: "<p>https://zoom.us/j/123456789</p>" },
    });

    expect(event?.id).toBe("uid-2");
    expect(event?.title).toBe("Design Review");
    expect(event?.start).toEqual(new Date("2026-07-10T21:00:00Z"));
    expect(event?.end).toEqual(new Date("2026-07-10T22:00:00Z"));
    expect(event?.plainBody).toBe("Plain body");
    expect(event?.htmlBody).toBe("<p>https://zoom.us/j/123456789</p>");
  });

  it("returns null when required event identity or start date is unavailable", () => {
    expect(
      mapThunderbirdEvent({
        title: "No id",
        startDate: "2026-07-10T20:00:00Z",
      }),
    ).toBeNull();

    expect(
      mapThunderbirdEvent({
        id: "no-start",
        title: "No start",
      }),
    ).toBeNull();
  });
});
