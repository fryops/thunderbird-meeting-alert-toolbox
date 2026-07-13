import type { MeetingProvider } from "../meeting-provider.js";

export function createProvider(input: {
  id: string;
  displayName: string;
  icon: string;
  detectionPatterns: readonly RegExp[];
  validate?: (url: string) => boolean;
  normalize?: (url: string) => string;
}): MeetingProvider {
  return {
    id: input.id,
    displayName: input.displayName,
    icon: input.icon,
    detectionPatterns: input.detectionPatterns,
    validate: input.validate ?? (() => true),
    normalize: input.normalize ?? ((url) => url),
  };
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
