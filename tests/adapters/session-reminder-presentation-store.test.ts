import { describe, expect, it, vi } from "vitest";
import { SessionReminderPresentationStore } from "../../src/adapters/thunderbird/session-reminder-presentation-store.js";

describe("SessionReminderPresentationStore", () => {
  it("persists handled keys in storage.session", async () => {
    const data: Record<string, unknown> = {};
    const store = new SessionReminderPresentationStore({
      storage: {
        session: {
          get: async (keys) => {
            const key = typeof keys === "string" ? keys : "";
            return key in data ? { [key]: data[key] } : {};
          },
          set: async (items) => {
            Object.assign(data, items);
          },
        },
      },
    });

    const key = `https://zoom.us/j/1\0${"2026-07-10T20:00:00.000Z"}`;
    await store.markHandled(key, { start: new Date("2026-07-10T20:00:00Z") });

    const other = new SessionReminderPresentationStore({
      storage: {
        session: {
          get: async (keys) => {
            const k = typeof keys === "string" ? keys : "";
            return k in data ? { [k]: data[k] } : {};
          },
          set: async (items) => {
            Object.assign(data, items);
          },
        },
      },
    });

    await expect(other.isHandled(key)).resolves.toBe(true);
  });

  it("falls back to memory when storage.session is missing", async () => {
    const store = new SessionReminderPresentationStore({});
    const key = `https://zoom.us/j/2\0${"2026-07-10T20:00:00.000Z"}`;
    await store.markHandled(key, { start: new Date("2026-07-10T20:00:00Z") });
    await expect(store.isHandled(key)).resolves.toBe(true);
  });

  it("falls back to memory when storage throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new SessionReminderPresentationStore({
      storage: {
        session: {
          get: async () => {
            throw new Error("quota");
          },
          set: async () => {
            throw new Error("quota");
          },
        },
        local: {
          get: async () => {
            throw new Error("quota");
          },
          set: async () => {
            throw new Error("quota");
          },
        },
      },
    });

    const key = `https://zoom.us/j/3\0${"2026-07-10T20:00:00.000Z"}`;
    await store.markHandled(key, { start: new Date("2026-07-10T20:00:00Z") });
    await expect(store.isHandled(key)).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to storage.local across background restarts when session is missing", async () => {
    const data: Record<string, unknown> = {};
    const local = {
      get: async (keys: string | string[] | Record<string, unknown> | null | undefined) => {
        const key = typeof keys === "string" ? keys : "";
        return key in data ? { [key]: data[key] } : {};
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(data, items);
      },
    };

    const first = new SessionReminderPresentationStore({ storage: { local } });
    const key = `https://zoom.us/j/4\0${"2026-07-10T20:00:00.000Z"}`;
    await first.markHandled(key, { start: new Date("2026-07-10T20:00:00Z") });

    const second = new SessionReminderPresentationStore({ storage: { local } });
    await expect(second.isHandled(key)).resolves.toBe(true);
  });
});
