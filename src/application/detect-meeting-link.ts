import type { CalendarEventFields } from "../domain/calendar-event-fields.js";
import { extractUrls } from "../domain/extract-urls.js";
import { MeetingDetectionResult } from "../domain/meeting-detection-result.js";
import type { MeetingLink } from "../domain/meeting-link.js";
import type { MeetingProviderRegistry } from "../domain/meeting-provider-registry.js";

export class DetectMeetingLink {
  constructor(private readonly registry: MeetingProviderRegistry) {}

  execute(event: CalendarEventFields): MeetingDetectionResult {
    const corpus = [
      event.location,
      event.description,
      event.plainBody,
      event.htmlBody,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join("\n");

    const urls = extractUrls(corpus);
    const links: MeetingLink[] = [];
    const seen = new Set<string>();

    for (const url of urls) {
      const match = this.registry.matchUrl(url);
      if (!match) continue;
      if (seen.has(match.url)) continue;
      seen.add(match.url);
      links.push({
        providerId: match.provider.id,
        displayName: match.provider.displayName,
        url: match.url,
        icon: match.provider.icon,
      });
    }

    return MeetingDetectionResult.from(links);
  }
}
