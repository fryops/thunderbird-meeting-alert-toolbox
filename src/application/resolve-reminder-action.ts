import type { CalendarEventFields } from "../domain/calendar-event-fields.js";
import type { MeetingDetectionResult } from "../domain/meeting-detection-result.js";
import type { MeetingLink } from "../domain/meeting-link.js";

export interface ReminderAction {
  eventId: string;
  title: string;
  start: Date;
  end?: Date;
  primary: MeetingLink;
  alternatives: readonly MeetingLink[];
}

export class ResolveReminderAction {
  execute(
    event: CalendarEventFields,
    detection: MeetingDetectionResult,
  ): ReminderAction | null {
    if (detection.isEmpty || !detection.primary) return null;
    return {
      eventId: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      primary: detection.primary,
      alternatives: detection.alternatives,
    };
  }
}
