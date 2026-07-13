// tests/domain/meeting-provider-registry.test.ts
import { describe, expect, it } from "vitest";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";
import type { MeetingProvider } from "../../src/domain/meeting-provider.js";

function fakeProvider(
  id: string,
  patterns: RegExp[],
  validate: (url: string) => boolean = () => true,
): MeetingProvider {
  return {
    id,
    displayName: id,
    icon: id,
    detectionPatterns: patterns,
    validate,
    normalize: (url) => url.replace(/\/$/, ""),
  };
}

describe("MeetingProviderRegistry", () => {
  it("resolves provider by id", () => {
    const registry = new MeetingProviderRegistry([
      fakeProvider("zoom", [/zoom\.us\/j\//i]),
    ]);
    expect(registry.getById("zoom")?.id).toBe("zoom");
    expect(registry.getById("missing")).toBeUndefined();
  });

  it("matches the first provider whose pattern and validate succeed", () => {
    const registry = new MeetingProviderRegistry([
      fakeProvider("zoom", [/zoom\.us\/j\//i]),
      fakeProvider("meet", [/meet\.google\.com\//i]),
    ]);
    const match = registry.matchUrl("https://zoom.us/j/123");
    expect(match?.provider.id).toBe("zoom");
    expect(match?.url).toBe("https://zoom.us/j/123");
  });

  it("skips providers that fail validate", () => {
    const registry = new MeetingProviderRegistry([
      fakeProvider("zoom", [/zoom\.us/i], () => false),
      fakeProvider("other", [/zoom\.us/i], () => true),
    ]);
    expect(registry.matchUrl("https://zoom.us/j/1")?.provider.id).toBe("other");
  });

  it("returns undefined for unknown urls", () => {
    const registry = new MeetingProviderRegistry([
      fakeProvider("zoom", [/zoom\.us\/j\//i]),
    ]);
    expect(registry.matchUrl("https://example.com/meeting")).toBeUndefined();
  });
});
