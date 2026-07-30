import type { CalendarEventFields } from "../domain/calendar-event-fields.js";
import type { DetectMeetingLink } from "./detect-meeting-link.js";
import type { ResolveReminderAction } from "./resolve-reminder-action.js";
import type { CalendarRepository } from "../ports/calendar-repository.js";
import type { NativeAlarmSuppressor } from "../ports/native-alarm-suppressor.js";
import type { ReminderPresentationStore } from "../ports/reminder-presentation-store.js";
import type { ReminderPresenter } from "../ports/reminder-presenter.js";

export class HandleReminder {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly calendar: CalendarRepository,
    private readonly detect: DetectMeetingLink,
    private readonly resolve: ResolveReminderAction,
    private readonly presenter: ReminderPresenter,
    private readonly presentations: ReminderPresentationStore,
    private readonly nativeAlarms?: NativeAlarmSuppressor,
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
      // Stay invisible for non-meeting events. Do not hide() — ReminderWatcher
      // may scan many due items in one poll, and closing would tear down a
      // companion just opened for a different meeting event.
      return;
    }

    // Deduplicate by meeting URL + start so invite copies / onAlarm+poll /
    // multi-calendar mirrors only open one companion window.
    const key = `${action.primary.url}\0${action.start.toISOString()}`;
    if (this.inFlight.has(key)) {
      console.info("Skipping reminder present; already in flight", {
        eventId: event.id,
        title: event.title,
      });
      return;
    }

    if (await this.presentations.isHandled(key)) {
      console.info("Skipping reminder present; already handled", {
        eventId: event.id,
        title: event.title,
      });
      await this.suppressNative(event);
      return;
    }

    this.inFlight.add(key);
    try {
      await this.presenter.present(action);
      await this.presentations.markHandled(key, {
        start: action.start,
        end: action.end,
      });
      await this.suppressNative(event);
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async suppressNative(event: CalendarEventFields): Promise<void> {
    if (!this.nativeAlarms) return;
    try {
      await this.nativeAlarms.suppressForEvent(event);
    } catch (error) {
      console.warn("Native alarm suppress failed", error);
    }
  }
}
