import type {
  ReminderHandledMeta,
  ReminderPresentationStore,
} from "../../ports/reminder-presentation-store.js";

type Entry = {
  handledAt: number;
  expiresAt: number;
};

const GRACE_MS = 2 * 60 * 60_000;

export class FakeReminderPresentationStore implements ReminderPresentationStore {
  readonly entries = new Map<string, Entry>();

  async isHandled(key: string): Promise<boolean> {
    this.prune(Date.now());
    const entry = this.entries.get(key);
    return entry !== undefined && entry.expiresAt > Date.now();
  }

  async markHandled(key: string, meta: ReminderHandledMeta): Promise<void> {
    const now = Date.now();
    const endMs = meta.end?.getTime() ?? meta.start.getTime();
    this.entries.set(key, {
      handledAt: now,
      expiresAt: Math.max(endMs, now) + GRACE_MS,
    });
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
