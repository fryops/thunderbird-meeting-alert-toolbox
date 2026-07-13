import type { BrowserLauncher } from "../ports/browser-launcher.js";

export class JoinMeeting {
  constructor(private readonly browser: BrowserLauncher) {}

  execute(url: string): Promise<void> {
    return this.browser.open(url);
  }
}
