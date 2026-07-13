import { describe, expect, it } from "vitest";
import { HybridReminderPresenter } from "../../src/adapters/thunderbird/hybrid-reminder-presenter.js";
import { FakeReminderPresenter } from "../../src/adapters/fake/fake-reminder-presenter.js";
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

describe("HybridReminderPresenter", () => {
  it("uses native when native can present", async () => {
    const native = new FakeReminderPresenter({ canPresent: true });
    const companion = new FakeReminderPresenter({ canPresent: true });
    const hybrid = new HybridReminderPresenter(native, companion);

    await hybrid.present(action);

    expect(native.presented).toEqual([action]);
    expect(companion.presented).toHaveLength(0);
  });

  it("falls back to companion when native cannot present", async () => {
    const native = new FakeReminderPresenter({ canPresent: false });
    const companion = new FakeReminderPresenter({ canPresent: true });
    const hybrid = new HybridReminderPresenter(native, companion);

    await hybrid.present(action);

    expect(native.presented).toHaveLength(0);
    expect(companion.presented).toEqual([action]);
  });

  it("can present when either delegate can present", async () => {
    const native = new FakeReminderPresenter({ canPresent: false });
    const companion = new FakeReminderPresenter({ canPresent: true });
    const hybrid = new HybridReminderPresenter(native, companion);

    await expect(hybrid.canPresent()).resolves.toBe(true);
  });

  it("hides both delegates", async () => {
    const native = new FakeReminderPresenter();
    const companion = new FakeReminderPresenter();
    const hybrid = new HybridReminderPresenter(native, companion);

    await hybrid.hide();

    expect(native.hiddenCalls).toBe(1);
    expect(companion.hiddenCalls).toBe(1);
  });
});
