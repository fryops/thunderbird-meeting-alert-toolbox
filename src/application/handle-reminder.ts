import type { CalendarEventFields } from "../domain/calendar-event-fields.js";
import type { DetectMeetingLink } from "./detect-meeting-link.js";
import type { ResolveReminderAction } from "./resolve-reminder-action.js";
import type { CalendarRepository } from "../ports/calendar-repository.js";
import type { ReminderPresenter } from "../ports/reminder-presenter.js";

export class HandleReminder {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly detect: DetectMeetingLink,
    private readonly resolve: ResolveReminderAction,
    private readonly presenter: ReminderPresenter,
  ) {}

  async execute(eventId: string): Promise<void> {
    let event: CalendarEventFields | null | undefined;
    try {
      event = await this.calendar.getEvent(eventId);
    } catch (error) {
      console.warn("Unable to load calendar event for reminder", { eventId, error });
      return;
    }

    if (!event) return;
    await this.executeFromEvent(event);
  }

  async executeFromEvent(event: CalendarEventFields): Promise<void> {
    const detection = this.detect.execute(event);
    const action = this.resolve.execute(event, detection);
    if (!action) {
      await this.presenter.hide();
      return;
    }

    await this.presenter.present(action);
  }
}
