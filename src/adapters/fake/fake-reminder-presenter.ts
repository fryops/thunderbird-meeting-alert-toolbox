import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

export class FakeReminderPresenter implements ReminderPresenter {
  readonly presented: ReminderAction[] = [];
  hiddenCalls = 0;

  constructor(private readonly options: { canPresent?: boolean } = {}) {}

  async canPresent(): Promise<boolean> {
    return this.options.canPresent ?? true;
  }

  async present(action: ReminderAction): Promise<void> {
    this.presented.push(action);
  }

  async hide(): Promise<void> {
    this.hiddenCalls += 1;
  }
}
