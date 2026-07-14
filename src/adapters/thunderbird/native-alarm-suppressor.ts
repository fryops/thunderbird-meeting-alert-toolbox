import type { CalendarEventFields } from "../../domain/calendar-event-fields.js";
import type { NativeAlarmSuppressor } from "../../ports/native-alarm-suppressor.js";

type ThunderbirdAlarmApi = {
  calendar?: {
    items?: {
      dismissAlarms?: (props: {
        calendarId: string;
        id: string;
        instance?: string;
      }) => Promise<unknown>;
    };
  };
};

/**
 * Dismisses native Thunderbird calendar alarms for meeting reminders so the
 * built-in Calendar Reminders dialog does not stay open beside our companion.
 */
export class ThunderbirdNativeAlarmSuppressor implements NativeAlarmSuppressor {
  constructor(private readonly thunderbird: ThunderbirdAlarmApi) {}

  async suppressForEvent(event: CalendarEventFields): Promise<void> {
    const dismiss = this.thunderbird.calendar?.items?.dismissAlarms;
    if (!dismiss) {
      console.warn("calendar.items.dismissAlarms unavailable; native reminder may remain");
      return;
    }

    const calendarId = event.calendarId;
    const id = event.id;
    if (!calendarId || !id) {
      console.warn("Cannot suppress native alarm without calendarId/id", {
        calendarId,
        id,
      });
      return;
    }

    try {
      await dismiss({
        calendarId,
        id,
        instance: event.instance,
      });
      console.info("Suppressed native Thunderbird alarm", { calendarId, id });
    } catch (error) {
      console.warn("Failed to suppress native Thunderbird alarm", {
        calendarId,
        id,
        error,
      });
    }
  }
}
