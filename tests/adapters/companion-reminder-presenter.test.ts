import { describe, expect, it } from "vitest";
import { CompanionReminderPresenter } from "../../src/adapters/thunderbird/companion-reminder-presenter.js";
import type { ReminderAction } from "../../src/application/resolve-reminder-action.js";

const action: ReminderAction = {
  eventId: "e1",
  title: "Sync",
  start: new Date("2026-07-10T20:00:00Z"),
  primary: {
    providerId: "zoom",
    displayName: "Zoom",
    url: "https://zoom.us/j/1",
    icon: "zoom",
  },
  alternatives: [],
};

describe("CompanionReminderPresenter", () => {
  it("closes the tracked companion window before presenting another", async () => {
    const calls: string[] = [];
    let createCount = 0;
    const presenter = new CompanionReminderPresenter({
      runtime: {
        getURL: (path) => `moz-extension://extension/${path}`,
      },
      windows: {
        create: async () => {
          calls.push("create");
          createCount += 1;
          return { id: createCount };
        },
        remove: async (windowId) => {
          calls.push(`remove:${windowId}`);
        },
      },
    });

    await presenter.present(action);
    await presenter.present({ ...action, eventId: "e2" });

    expect(calls).toEqual(["create", "remove:1", "create"]);
  });

  it("closes the tracked companion window when hidden", async () => {
    const removedWindowIds: number[] = [];
    const presenter = new CompanionReminderPresenter({
      runtime: {
        getURL: (path) => `moz-extension://extension/${path}`,
      },
      windows: {
        create: async () => ({ id: 7 }),
        remove: async (windowId) => {
          removedWindowIds.push(windowId);
        },
      },
    });

    await presenter.present(action);
    await presenter.hide();
    await presenter.hide();

    expect(removedWindowIds).toEqual([7]);
  });
});
