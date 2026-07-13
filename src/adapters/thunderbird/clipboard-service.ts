import type { ClipboardService } from "../../ports/clipboard-service.js";

type ClipboardLike = {
  writeText?: (text: string) => Promise<void>;
};

export class ThunderbirdClipboardService implements ClipboardService {
  constructor(private readonly clipboard: ClipboardLike) {}

  async writeText(text: string): Promise<void> {
    const writeText = this.clipboard.writeText;
    if (!writeText) {
      throw new Error("Clipboard API is unavailable");
    }

    await writeText(text);
  }
}
