import type { CalendarEventFields } from "../domain/calendar-event-fields.js";

export interface CalendarRepository {
  getEvent(eventId: string): Promise<CalendarEventFields | null>;
}
