import type { CalendarEventFields } from "../domain/calendar-event-fields.js";

/**
 * Acks/dismisses Thunderbird's native calendar alarm UI for an event
 * we are presenting ourselves.
 */
export interface NativeAlarmSuppressor {
  suppressForEvent(event: CalendarEventFields): Promise<void>;
}
