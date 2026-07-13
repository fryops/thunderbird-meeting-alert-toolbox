import type { BrowserLauncher } from "../../ports/browser-launcher.js";

type ThunderbirdTabsApi = {
  windows?: {
    openDefaultBrowser?: (url: string) => Promise<unknown>;
  };
  tabs?: {
    create?: (options: { url: string }) => Promise<unknown>;
  };
};

export class ThunderbirdBrowserLauncher implements BrowserLauncher {
  constructor(private readonly thunderbird: ThunderbirdTabsApi) {}

  async open(url: string): Promise<void> {
    const parsed = new URL(url);
    if (!["https:", "http:", "zoommtg:"].includes(parsed.protocol)) {
      throw new Error(`Unsupported meeting URL protocol: ${parsed.protocol}`);
    }

    const openDefaultBrowser = this.thunderbird.windows?.openDefaultBrowser;
    if (openDefaultBrowser) {
      await openDefaultBrowser(parsed.toString());
      return;
    }

    const createTab = this.thunderbird.tabs?.create;
    if (!createTab) {
      throw new Error("Thunderbird browser launch APIs are unavailable");
    }

    await createTab({ url: parsed.toString() });
  }
}
