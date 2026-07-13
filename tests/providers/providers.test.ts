import { describe, expect, it } from "vitest";
import { createDefaultProviders } from "../../src/domain/providers/index.js";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";

function registry() {
  return new MeetingProviderRegistry(createDefaultProviders());
}

describe("provider detection", () => {
  it.each([
    ["zoom", "https://zoom.us/j/123456789"],
    ["zoom", "https://company.zoom.us/j/123456789"],
    ["zoom", "zoommtg://zoom.us/join?action=join&confno=123"],
    ["teams", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc"],
    ["teams", "https://gov.teams.microsoft.us/l/meetup-join/xyz"],
    ["google-meet", "https://meet.google.com/abc-defg-hij"],
    ["webex", "https://company.webex.com/meet/jane"],
    ["goto", "https://meet.goto.com/123456789"],
    ["slack", "https://app.slack.com/huddle/T123/C456"],
    ["slack", "https://app.slack.com/client/T123/C456"],
    ["discord", "https://discord.gg/abcdef"],
    ["discord", "https://discord.com/channels/123/456"],
    ["jitsi", "https://meet.jit.si/RoomName"],
  ] as const)("detects %s for %s", (providerId, url) => {
    const match = registry().matchUrl(url);
    expect(match?.provider.id).toBe(providerId);
  });

  it("rejects invalid lookalikes", () => {
    expect(registry().matchUrl("https://zoom.us/pricing")).toBeUndefined();
    expect(registry().matchUrl("https://example.com/meet.google.com/fake")).toBeUndefined();
    expect(registry().matchUrl("https://notwebex.com/meet/x")).toBeUndefined();
  });

  it("registry lists all eight providers", () => {
    expect(createDefaultProviders().map((p) => p.id).sort()).toEqual(
      [
        "discord",
        "google-meet",
        "goto",
        "jitsi",
        "slack",
        "teams",
        "webex",
        "zoom",
      ].sort(),
    );
  });
});
