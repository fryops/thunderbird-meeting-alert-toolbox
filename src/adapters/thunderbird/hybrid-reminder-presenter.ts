import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

export class HybridReminderPresenter implements ReminderPresenter {
  constructor(
    private readonly native: ReminderPresenter,
    private readonly companion: ReminderPresenter,
  ) {}

  async canPresent(): Promise<boolean> {
    return (
      (await this.native.canPresent()) || (await this.companion.canPresent())
    );
  }

  async present(action: ReminderAction): Promise<void> {
    if (await this.native.canPresent()) {
      await this.native.present(action);
      return;
    }

    await this.companion.present(action);
  }

  async hide(): Promise<void> {
    await this.native.hide();
    await this.companion.hide();
  }
}
