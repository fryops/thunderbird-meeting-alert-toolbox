/**
 * Minimal VEVENT property extraction for Thunderbird calendar experiment ICS payloads.
 * Handles folded lines and basic escaped characters; ignores malformed input.
 */

export interface ParsedIcsEvent {
  uid?: string;
  summary?: string;
  location?: string;
  description?: string;
  dtstart?: string;
  dtend?: string;
}

export function parseIcsEvent(ics: string): ParsedIcsEvent | null {
  const unfolded = unfoldIcs(ics);
  const block = extractVeventBlock(unfolded);
  if (!block) return null;

  return {
    uid: readProperty(block, "UID"),
    summary: unescapeIcs(readProperty(block, "SUMMARY")),
    location: unescapeIcs(readProperty(block, "LOCATION")),
    description: unescapeIcs(readProperty(block, "DESCRIPTION")),
    dtstart: readProperty(block, "DTSTART"),
    dtend: readProperty(block, "DTEND"),
  };
}

export function icsDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();

  // DATE: YYYYMMDD
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00Z`;
  }

  // UTC DATETIME: YYYYMMDDTHHMMSSZ
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  if (utc) {
    return `${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`;
  }

  // Local DATETIME without Z — treat as local wall time by appending Z only if parse works;
  // prefer leaving timezone-less values as ISO-like local for Date parsing.
  const local = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (local) {
    return `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6]}`;
  }

  return raw;
}

function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function extractVeventBlock(ics: string): string | null {
  const match = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/i.exec(ics);
  return match?.[1] ?? null;
}

function readProperty(block: string, name: string): string | undefined {
  const re = new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, "im");
  const match = re.exec(block);
  return match?.[1]?.trim() || undefined;
}

function unescapeIcs(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}
