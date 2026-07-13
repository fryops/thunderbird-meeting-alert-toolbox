// tests/domain/meeting-detection-result.test.ts
import { describe, expect, it } from "vitest";
import { MeetingDetectionResult } from "../../src/domain/meeting-detection-result.js";
import type { MeetingLink } from "../../src/domain/meeting-link.js";

function link(providerId: string, url: string): MeetingLink {
  return { providerId, url, displayName: providerId };
}

describe("MeetingDetectionResult", () => {
  it("exposes first link as primary and the rest as alternatives", () => {
    const result = MeetingDetectionResult.from([
      link("zoom", "https://zoom.us/j/1"),
      link("teams", "https://teams.microsoft.com/l/meetup-join/1"),
    ]);
    expect(result.isEmpty).toBe(false);
    expect(result.primary).toEqual(link("zoom", "https://zoom.us/j/1"));
    expect(result.alternatives).toEqual([
      link("teams", "https://teams.microsoft.com/l/meetup-join/1"),
    ]);
    expect(result.all).toHaveLength(2);
  });

  it("is empty when no links", () => {
    const result = MeetingDetectionResult.from([]);
    expect(result.isEmpty).toBe(true);
    expect(result.primary).toBeUndefined();
    expect(result.alternatives).toEqual([]);
  });
});
