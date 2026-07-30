export type ReminderHandledMeta = {
  start: Date;
  end?: Date;
};

/**
 * Remembers which meeting occurrences have already been presented so
 * onAlarm/poll/background restarts do not reopen the companion.
 */
export interface ReminderPresentationStore {
  isHandled(key: string): Promise<boolean>;
  markHandled(key: string, meta: ReminderHandledMeta): Promise<void>;
}
