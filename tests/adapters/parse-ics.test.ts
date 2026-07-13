import { describe, expect, it } from "vitest";
import { icsDateToIso, parseIcsEvent } from "../../src/adapters/thunderbird/parse-ics.js";
import { mapThunderbirdEvent } from "../../src/adapters/thunderbird/calendar-repository.js";

describe("parseIcsEvent", () => {
  it("extracts summary, location, description, and dates from a VEVENT", () => {
    const parsed = parseIcsEvent(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:abc-123
SUMMARY:Team Sync
LOCATION:https://meet.google.com/abc-defg-hij
DESCRIPTION:Join us\\nBring notes
DTSTART:20260713T180000Z
DTEND:20260713T183000Z
END:VEVENT
END:VCALENDAR`);

    expect(parsed).toEqual({
      uid: "abc-123",
      summary: "Team Sync",
      location: "https://meet.google.com/abc-defg-hij",
      description: "Join us\nBring notes",
      dtstart: "20260713T180000Z",
      dtend: "20260713T183000Z",
    });
  });

  it("unfolds folded ICS lines", () => {
    const parsed = parseIcsEvent(`BEGIN:VEVENT
SUMMARY:Long
  Title
LOCATION:https://zoom.us/j/1
DTSTART:20260713T180000Z
END:VEVENT`);

    expect(parsed?.summary).toBe("Long Title");
    expect(parsed?.location).toBe("https://zoom.us/j/1");
  });
});

describe("icsDateToIso", () => {
  it("converts UTC ICS timestamps", () => {
    expect(icsDateToIso("20260713T180000Z")).toBe("2026-07-13T18:00:00Z");
  });
});

describe("mapThunderbirdEvent ICS payloads", () => {
  it("maps calendar experiment ICS items", () => {
    const event = mapThunderbirdEvent({
      id: "item-ics",
      calendarId: "cal-1",
      type: "event",
      format: "ical",
      item: `BEGIN:VEVENT
UID:item-ics
SUMMARY:Customer Call
LOCATION:https://teams.microsoft.com/l/meetup-join/abc
DESCRIPTION:Dial-in details
DTSTART:20260713T200000Z
DTEND:20260713T203000Z
END:VEVENT`,
    });

    expect(event?.id).toBe("item-ics");
    expect(event?.title).toBe("Customer Call");
    expect(event?.location).toBe("https://teams.microsoft.com/l/meetup-join/abc");
    expect(event?.description).toContain("Dial-in");
    expect(event?.start).toEqual(new Date("2026-07-13T20:00:00Z"));
    expect(event?.end).toEqual(new Date("2026-07-13T20:30:00Z"));
  });
});
