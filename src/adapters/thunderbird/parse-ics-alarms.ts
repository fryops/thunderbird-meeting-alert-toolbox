/**
 * Extract alarm fire times from a VEVENT ICS payload.
 */

import { icsDateToIso, parseIcsEvent } from "./parse-ics.js";

export interface IcsAlarmFire {
  at: Date;
  related: "start" | "end" | "absolute";
}

export function parseIcsAlarmFires(ics: string, now = new Date()): IcsAlarmFire[] {
  const event = parseIcsEvent(ics);
  if (!event?.dtstart) return [];

  const start = parseDate(icsDateToIso(event.dtstart));
  const end = parseDate(icsDateToIso(event.dtend)) ?? start;
  if (!start) return [];

  const blocks = extractValarmBlocks(unfoldIcs(ics));
  if (blocks.length === 0) {
    // Many calendars still show a UI reminder without exposing VALARM in synced ICS.
    // Seed start-15m and start so both common reminder times are covered.
    return [
      { at: new Date(start.getTime() - 15 * 60_000), related: "start" },
      { at: start, related: "start" },
    ];
  }

  const fires: IcsAlarmFire[] = [];
  for (const block of blocks) {
    const action = readProperty(block, "ACTION")?.toUpperCase();
    if (action && action !== "DISPLAY" && action !== "AUDIO") continue;

    const triggerLine = readPropertyLine(block, "TRIGGER");
    if (!triggerLine) continue;

    const absolute = /VALUE=DATE-TIME/i.test(triggerLine.params)
      ? parseDate(icsDateToIso(triggerLine.value) ?? triggerLine.value)
      : null;
    if (absolute) {
      fires.push({ at: absolute, related: "absolute" });
      continue;
    }

    const related = /RELATED=END/i.test(triggerLine.params) ? "end" : "start";
    const base = related === "end" ? end : start;
    if (!base) continue;
    const offsetMs = parseDurationToMs(triggerLine.value);
    if (offsetMs === null) continue;
    fires.push({ at: new Date(base.getTime() + offsetMs), related });
  }

  return fires.filter((fire) => !Number.isNaN(fire.at.getTime()) && fire.at.getTime() <= now.getTime() + 24 * 60 * 60_000);
}

export function alarmsDueBetween(fires: IcsAlarmFire[], from: Date, to: Date): IcsAlarmFire[] {
  const startMs = from.getTime();
  const endMs = to.getTime();
  return fires.filter((fire) => {
    const t = fire.at.getTime();
    return t > startMs && t <= endMs;
  });
}

function extractValarmBlocks(ics: string): string[] {
  const blocks: string[] = [];
  const re = /BEGIN:VALARM([\s\S]*?)END:VALARM/gi;
  for (const match of ics.matchAll(re)) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function readProperty(block: string, name: string): string | undefined {
  return readPropertyLine(block, name)?.value;
}

function readPropertyLine(
  block: string,
  name: string,
): { params: string; value: string } | undefined {
  const re = new RegExp(`^${name}([^:]*):(.*)$`, "im");
  const match = re.exec(block);
  if (!match) return undefined;
  return { params: match[1] ?? "", value: (match[2] ?? "").trim() };
}

function parseDurationToMs(value: string): number | null {
  // Supports forms like -PT15M, -P0DT0H5M0S, PT1H, -P1D
  const match =
    /^([+-]?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value.trim());
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const days = Number(match[2] ?? 0);
  const hours = Number(match[3] ?? 0);
  const minutes = Number(match[4] ?? 0);
  const seconds = Number(match[5] ?? 0);
  return sign * (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
