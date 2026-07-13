import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

export class NativeReminderPresenter implements ReminderPresenter {
  async canPresent(): Promise<boolean> {
    // Thunderbird 128 does not expose a stable MailExtension API for extending
    // the native calendar reminder row. Keep native presentation disabled in v1.
    return false;
  }

  async present(_action: ReminderAction): Promise<void> {
    return;
  }

  async hide(): Promise<void> {
    return;
  }
}
