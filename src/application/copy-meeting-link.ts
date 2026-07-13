import type { ClipboardService } from "../ports/clipboard-service.js";

export class CopyMeetingLink {
  constructor(private readonly clipboard: ClipboardService) {}

  execute(url: string): Promise<void> {
    return this.clipboard.writeText(url);
  }
}
