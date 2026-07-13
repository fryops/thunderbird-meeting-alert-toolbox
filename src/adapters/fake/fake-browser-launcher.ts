import type { BrowserLauncher } from "../../ports/browser-launcher.js";

export class FakeBrowserLauncher implements BrowserLauncher {
  readonly opened: string[] = [];
  failNext = false;

  async open(url: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("launch failed");
    }
    this.opened.push(url);
  }
}
