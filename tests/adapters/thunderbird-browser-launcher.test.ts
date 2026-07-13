import { describe, expect, it } from "vitest";
import { ThunderbirdBrowserLauncher } from "../../src/adapters/thunderbird/browser-launcher.js";

describe("ThunderbirdBrowserLauncher", () => {
  it("opens meeting urls in the default browser when available", async () => {
    const openedUrls: string[] = [];
    const createdTabs: string[] = [];
    const launcher = new ThunderbirdBrowserLauncher({
      windows: {
        openDefaultBrowser: async (url) => {
          openedUrls.push(url);
        },
      },
      tabs: {
        create: async ({ url }) => {
          createdTabs.push(url);
        },
      },
    });

    await launcher.open("https://meet.google.com/abc-defg-hij");

    expect(openedUrls).toEqual(["https://meet.google.com/abc-defg-hij"]);
    expect(createdTabs).toEqual([]);
  });

  it("falls back to opening a tab when default browser launch is unavailable", async () => {
    const createdTabs: string[] = [];
    const launcher = new ThunderbirdBrowserLauncher({
      tabs: {
        create: async ({ url }) => {
          createdTabs.push(url);
        },
      },
    });

    await launcher.open("https://zoom.us/j/1");

    expect(createdTabs).toEqual(["https://zoom.us/j/1"]);
  });
});
