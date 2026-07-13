export interface CalendarEventFields {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  plainBody?: string;
  htmlBody?: string;
}
