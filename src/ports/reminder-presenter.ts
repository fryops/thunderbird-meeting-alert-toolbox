import type { ReminderAction } from "../application/resolve-reminder-action.js";

export interface ReminderPresenter {
  canPresent(): Promise<boolean>;
  present(action: ReminderAction): Promise<void>;
  hide(): Promise<void>;
}
