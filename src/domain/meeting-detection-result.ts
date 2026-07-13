import type { MeetingLink } from "./meeting-link.js";

export class MeetingDetectionResult {
  private constructor(readonly all: readonly MeetingLink[]) {}

  static from(links: readonly MeetingLink[]): MeetingDetectionResult {
    return new MeetingDetectionResult([...links]);
  }

  get isEmpty(): boolean {
    return this.all.length === 0;
  }

  get primary(): MeetingLink | undefined {
    return this.all[0];
  }

  get alternatives(): readonly MeetingLink[] {
    return this.all.slice(1);
  }
}
