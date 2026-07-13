import { CompanionReminderPresenter } from "../adapters/thunderbird/companion-reminder-presenter.js";
import { ThunderbirdBrowserLauncher } from "../adapters/thunderbird/browser-launcher.js";
import { ThunderbirdCalendarRepository } from "../adapters/thunderbird/calendar-repository.js";
import { ThunderbirdClipboardService } from "../adapters/thunderbird/clipboard-service.js";
import { HybridReminderPresenter } from "../adapters/thunderbird/hybrid-reminder-presenter.js";
import { NativeReminderPresenter } from "../adapters/thunderbird/native-reminder-presenter.js";
import { CopyMeetingLink } from "../application/copy-meeting-link.js";
import { DetectMeetingLink } from "../application/detect-meeting-link.js";
import { HandleReminder } from "../application/handle-reminder.js";
import { JoinMeeting } from "../application/join-meeting.js";
import { ResolveReminderAction } from "../application/resolve-reminder-action.js";
import { MeetingProviderRegistry } from "../domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../domain/providers/index.js";

export interface AppComposition {
  handleReminder: HandleReminder;
  joinMeeting: JoinMeeting;
  copyMeetingLink: CopyMeetingLink;
  presenter: HybridReminderPresenter;
}

export function createApp(
  thunderbird: unknown,
  clipboard: Clipboard = navigator.clipboard,
): AppComposition {
  const thunderbirdApi = thunderbird as ConstructorParameters<
    typeof ThunderbirdCalendarRepository
  >[0] &
    ConstructorParameters<typeof ThunderbirdBrowserLauncher>[0] &
    ConstructorParameters<typeof CompanionReminderPresenter>[0];

  const registry = new MeetingProviderRegistry(createDefaultProviders());
  const detect = new DetectMeetingLink(registry);
  const resolve = new ResolveReminderAction();
  const calendar = new ThunderbirdCalendarRepository(thunderbirdApi);
  const browser = new ThunderbirdBrowserLauncher(thunderbirdApi);
  const clipboardService = new ThunderbirdClipboardService(clipboard);
  const presenter = new HybridReminderPresenter(
    new NativeReminderPresenter(),
    new CompanionReminderPresenter(thunderbirdApi),
  );

  return {
    handleReminder: new HandleReminder(calendar, detect, resolve, presenter),
    joinMeeting: new JoinMeeting(browser),
    copyMeetingLink: new CopyMeetingLink(clipboardService),
    presenter,
  };
}
