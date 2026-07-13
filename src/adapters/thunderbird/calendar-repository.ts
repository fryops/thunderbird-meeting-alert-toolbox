import type { CalendarEventFields } from "../../domain/calendar-event-fields.js";
import type { CalendarRepository } from "../../ports/calendar-repository.js";
import { icsDateToIso, parseIcsEvent } from "./parse-ics.js";

type ThunderbirdApi = {
  calendar?: {
    items?: {
      get?: (
        calendarId: string,
        itemId: string,
        options?: { returnFormat?: "ical" | "jcal" },
      ) => Promise<unknown>;
    };
    events?: {
      get?: (eventId: string) => Promise<unknown>;
    };
    getEvent?: (eventId: string) => Promise<unknown>;
  };
};

export type ThunderbirdCalendarEventRecord = Record<string, unknown>;

export class ThunderbirdCalendarRepository implements CalendarRepository {
  constructor(private readonly thunderbird: ThunderbirdApi) {}

  async getEvent(eventId: string): Promise<CalendarEventFields | null> {
    const event = await this.loadThunderbirdEvent(eventId);
    return event && isRecord(event) ? mapThunderbirdEvent(event) : null;
  }

  private async loadThunderbirdEvent(eventId: string): Promise<unknown> {
    const calendarItemRef = parseCalendarItemRef(eventId);
    const itemsApi = this.thunderbird.calendar?.items;

    if (calendarItemRef && itemsApi?.get) {
      return itemsApi.get(calendarItemRef.calendarId, calendarItemRef.itemId, {
        returnFormat: "ical",
      });
    }

    const eventsApi = this.thunderbird.calendar?.events;
    if (eventsApi?.get) {
      return eventsApi.get(eventId);
    }

    const getEvent = this.thunderbird.calendar?.getEvent;
    if (getEvent) {
      return getEvent(eventId);
    }

    throw new Error("Thunderbird calendar read API is unavailable");
  }
}

export function mapThunderbirdEvent(
  event: ThunderbirdCalendarEventRecord,
): CalendarEventFields | null {
  // Calendar experiment item with ICS payload
  if (typeof event.item === "string" && /BEGIN:VEVENT/i.test(event.item)) {
    return mapIcsCalendarItem(event);
  }

  // Flat/legacy shapes
  const id = firstString(event.id, event.itemId, event.uid);
  const start = parseDateLike(firstValue(event.startDate, event.start, event.when));

  if (!id || !start) return null;

  const mapped: CalendarEventFields = {
    id,
    title: firstString(event.title, event.summary, event.name) ?? "Untitled event",
    start,
  };

  const end = parseDateLike(firstValue(event.endDate, event.end));
  const location = firstString(event.location, event.venue);
  const description = firstString(event.description, event.notes);
  const plainBody = firstString(
    event.plainBody,
    nestedString(event.body, "plain"),
    nestedString(event.description, "plain"),
  );
  const htmlBody = firstString(
    event.htmlBody,
    event.htmlDescription,
    nestedString(event.body, "html"),
    nestedString(event.description, "html"),
  );

  if (end) mapped.end = end;
  if (location) mapped.location = location;
  if (description) mapped.description = description;
  if (plainBody) mapped.plainBody = plainBody;
  if (htmlBody) mapped.htmlBody = htmlBody;

  return mapped;
}

function mapIcsCalendarItem(
  event: ThunderbirdCalendarEventRecord,
): CalendarEventFields | null {
  const ics = typeof event.item === "string" ? event.item : "";
  const parsed = parseIcsEvent(ics);
  if (!parsed) return null;

  const id =
    firstString(event.id, parsed.uid, event.itemId) ??
    firstString(event.calendarId);
  const startIso = icsDateToIso(parsed.dtstart);
  const start = startIso ? new Date(startIso) : undefined;
  if (!id || !start || Number.isNaN(start.getTime())) return null;

  const mapped: CalendarEventFields = {
    id,
    title: parsed.summary ?? firstString(event.title) ?? "Untitled event",
    start,
  };

  const endIso = icsDateToIso(parsed.dtend);
  if (endIso) {
    const end = new Date(endIso);
    if (!Number.isNaN(end.getTime())) mapped.end = end;
  }

  if (parsed.location) mapped.location = parsed.location;
  if (parsed.description) {
    mapped.description = parsed.description;
    mapped.plainBody = parsed.description;
  }

  return mapped;
}

function parseCalendarItemRef(
  eventId: string,
): { calendarId: string; itemId: string } | null {
  try {
    const parsed: unknown = JSON.parse(eventId);
    if (!isRecord(parsed)) return null;
    const calendarId = firstString(parsed.calendarId);
    const itemId = firstString(parsed.itemId, parsed.id);
    return calendarId && itemId ? { calendarId, itemId } : null;
  } catch {
    return null;
  }
}

function parseDateLike(value: unknown): Date | undefined {
  const raw = firstString(
    value,
    nestedString(value, "dateTime"),
    nestedString(value, "date"),
    nestedString(value, "nativeTime"),
  );
  if (!raw) return undefined;

  const fromIcs = icsDateToIso(raw);
  const date = new Date(fromIcs ?? raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function nestedString(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
