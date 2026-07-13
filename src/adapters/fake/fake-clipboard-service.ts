import type { ClipboardService } from "../../ports/clipboard-service.js";

export class FakeClipboardService implements ClipboardService {
  readonly texts: string[] = [];
  failNext = false;

  async writeText(text: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("clipboard failed");
    }
    this.texts.push(text);
  }
}
