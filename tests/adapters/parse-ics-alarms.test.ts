import { describe, expect, it } from "vitest";
import {
  alarmsDueBetween,
  parseIcsAlarmFires,
} from "../../src/adapters/thunderbird/parse-ics-alarms.js";

describe("parseIcsAlarmFires", () => {
  it("parses relative DISPLAY triggers before DTSTART", () => {
    const ics = `BEGIN:VEVENT
UID:a1
SUMMARY:Sync
LOCATION:https://meet.google.com/abc-defg-hij
DTSTART:20260713T180000Z
DTEND:20260713T183000Z
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT15M
END:VALARM
END:VEVENT`;

    const fires = parseIcsAlarmFires(ics, new Date("2026-07-13T17:00:00Z"));
    expect(fires).toHaveLength(1);
    expect(fires[0]?.at.toISOString()).toBe("2026-07-13T17:45:00.000Z");
    expect(fires[0]?.related).toBe("start");
  });

  it("falls back to start-15m and start when VALARM is absent", () => {
    const ics = `BEGIN:VEVENT
UID:a2
SUMMARY:Sync
DTSTART:20260713T180000Z
END:VEVENT`;
    const fires = parseIcsAlarmFires(ics, new Date("2026-07-13T17:00:00Z"));
    expect(fires.map((f) => f.at.toISOString())).toEqual([
      "2026-07-13T17:45:00.000Z",
      "2026-07-13T18:00:00.000Z",
    ]);
  });
});

describe("alarmsDueBetween", () => {
  it("returns alarms in the (from, to] window", () => {
    const due = alarmsDueBetween(
      [{ at: new Date("2026-07-13T17:45:00Z"), related: "start" }],
      new Date("2026-07-13T17:44:00Z"),
      new Date("2026-07-13T17:45:30Z"),
    );
    expect(due).toHaveLength(1);
  });
});
