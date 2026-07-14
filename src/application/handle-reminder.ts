import type { CalendarEventFields } from "../domain/calendar-event-fields.js";
import type { DetectMeetingLink } from "./detect-meeting-link.js";
import type { ResolveReminderAction } from "./resolve-reminder-action.js";
import type { CalendarRepository } from "../ports/calendar-repository.js";
import type { NativeAlarmSuppressor } from "../ports/native-alarm-suppressor.js";
import type { ReminderPresenter } from "../ports/reminder-presenter.js";

const DEFAULT_DEBOUNCE_MS = 45 * 60_000;

export class HandleReminder {
  private readonly recentlyPresented = new Map<string, number>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly calendar: CalendarRepository,
    private readonly detect: DetectMeetingLink,
    private readonly resolve: ResolveReminderAction,
    private readonly presenter: ReminderPresenter,
    private readonly nativeAlarms?: NativeAlarmSuppressor,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
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

    const last = this.recentlyPresented.get(key);
    const now = Date.now();
    if (last !== undefined && now - last < this.debounceMs) {
      console.info("Skipping reminder present; recently shown", {
        eventId: event.id,
        title: event.title,
        ageMs: now - last,
      });
      // Still try to suppress native UI if a race left it up.
      await this.suppressNative(event);
      return;
    }

    this.inFlight.add(key);
    try {
      await this.presenter.present(action);
      this.recentlyPresented.set(key, now);
      await this.suppressNative(event);
      this.prune(now);
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

  private prune(now: number): void {
    for (const [key, at] of this.recentlyPresented) {
      if (now - at > this.debounceMs * 2) this.recentlyPresented.delete(key);
    }
  }
}
