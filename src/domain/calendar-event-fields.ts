export interface CalendarEventFields {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  plainBody?: string;
  htmlBody?: string;
  /** Thunderbird calendar id when known (needed to dismiss native alarms). */
  calendarId?: string;
  /** Recurrence instance id (iCal) when this is an occurrence. */
  instance?: string;
}

