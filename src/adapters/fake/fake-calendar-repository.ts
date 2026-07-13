import type { CalendarEventFields } from "../../domain/calendar-event-fields.js";
import type { CalendarRepository } from "../../ports/calendar-repository.js";

export class FakeCalendarRepository implements CalendarRepository {
  constructor(
    private readonly events: CalendarEventFields[],
    private readonly options: { failOnGet?: boolean } = {},
  ) {}

  async getEvent(eventId: string): Promise<CalendarEventFields | null> {
    if (this.options.failOnGet) {
      throw new Error("Fake calendar event load failure");
    }

    return this.events.find((event) => event.id === eventId) ?? null;
  }
}
