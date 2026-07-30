import type {
  ReminderHandledMeta,
  ReminderPresentationStore,
} from "../../ports/reminder-presentation-store.js";

type HandledEntry = {
  handledAt: number;
  expiresAt: number;
};

type StorageArea = {
  get?: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  set?: (items: Record<string, unknown>) => Promise<void>;
};

type ThunderbirdStorageApi = {
  storage?: {
    session?: StorageArea;
    local?: StorageArea;
  };
};

const STORAGE_KEY = "reminderHandled";
const GRACE_MS = 2 * 60 * 60_000;

/**
 * Durable "already presented" records.
 * Prefers storage.session, then storage.local (survives MV3 background restarts),
 * then in-memory as a last resort.
 */
export class SessionReminderPresentationStore implements ReminderPresentationStore {
  private readonly memory = new Map<string, HandledEntry>();
  private sessionFailed = false;
  private localFailed = false;

  constructor(private readonly thunderbird: ThunderbirdStorageApi) {}

  async isHandled(key: string): Promise<boolean> {
    const now = Date.now();
    const entries = await this.readEntries();
    this.prune(entries, now);
    await this.writeEntries(entries);
    const entry = entries[key];
    return entry !== undefined && entry.expiresAt > now;
  }

  async markHandled(key: string, meta: ReminderHandledMeta): Promise<void> {
    const now = Date.now();
    const endMs = meta.end?.getTime() ?? meta.start.getTime();
    const entries = await this.readEntries();
    this.prune(entries, now);
    entries[key] = {
      handledAt: now,
      expiresAt: Math.max(endMs, now) + GRACE_MS,
    };
    await this.writeEntries(entries);
  }

  private areas(): StorageArea[] {
    const areas: StorageArea[] = [];
    if (!this.sessionFailed && this.thunderbird.storage?.session) {
      areas.push(this.thunderbird.storage.session);
    }
    if (!this.localFailed && this.thunderbird.storage?.local) {
      areas.push(this.thunderbird.storage.local);
    }
    return areas;
  }

  private async readEntries(): Promise<Record<string, HandledEntry>> {
    for (const area of this.areas()) {
      if (!area.get) continue;
      try {
        const result = await area.get(STORAGE_KEY);
        const raw = result[STORAGE_KEY];
        if (isEntryMap(raw)) return { ...raw };
      } catch (error) {
        this.markAreaFailed(area);
        console.warn("reminder presentation store read failed; trying next backend", error);
      }
    }
    return Object.fromEntries(this.memory);
  }

  private async writeEntries(entries: Record<string, HandledEntry>): Promise<void> {
    this.memory.clear();
    for (const [key, entry] of Object.entries(entries)) {
      this.memory.set(key, entry);
    }

    let wrote = false;
    for (const area of this.areas()) {
      if (!area.set) continue;
      try {
        await area.set({ [STORAGE_KEY]: entries });
        wrote = true;
      } catch (error) {
        this.markAreaFailed(area);
        console.warn("reminder presentation store write failed; trying next backend", error);
      }
    }

    if (!wrote && this.areas().length === 0) {
      // Memory-only path already updated above.
      return;
    }
  }

  private markAreaFailed(area: StorageArea): void {
    if (area === this.thunderbird.storage?.session) this.sessionFailed = true;
    if (area === this.thunderbird.storage?.local) this.localFailed = true;
  }

  private prune(entries: Record<string, HandledEntry>, now: number): void {
    for (const [key, entry] of Object.entries(entries)) {
      if (!entry || entry.expiresAt <= now) delete entries[key];
    }
  }
}

function isEntryMap(value: unknown): value is Record<string, HandledEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const entry of Object.values(value)) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as HandledEntry).handledAt !== "number" ||
      typeof (entry as HandledEntry).expiresAt !== "number"
    ) {
      return false;
    }
  }
  return true;
}
