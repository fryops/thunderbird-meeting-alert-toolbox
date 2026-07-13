import type { MeetingProvider } from "./meeting-provider.js";

export interface ProviderMatch {
  provider: MeetingProvider;
  url: string;
}

export class MeetingProviderRegistry {
  private readonly providers: readonly MeetingProvider[];

  constructor(providers: readonly MeetingProvider[]) {
    this.providers = [...providers];
  }

  getById(id: string): MeetingProvider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  list(): readonly MeetingProvider[] {
    return this.providers;
  }

  matchUrl(url: string): ProviderMatch | undefined {
    for (const provider of this.providers) {
      const matched = provider.detectionPatterns.some((re) => re.test(url));
      if (!matched) continue;
      if (!provider.validate(url)) continue;
      return { provider, url: provider.normalize(url) };
    }
    return undefined;
  }
}
