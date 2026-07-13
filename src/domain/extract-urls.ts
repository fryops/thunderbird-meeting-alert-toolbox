// src/domain/extract-urls.ts
const URL_RE =
  /\b((?:https?:\/\/|zoommtg:\/\/)[^\s<>"'()\[\]{}]+)/gi;

export function stripHtml(input: string): string {
  const withHrefs = input.replace(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    "$1 $2",
  );
  const withoutTags = withHrefs
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCandidate(raw: string): string | undefined {
  const trimmed = raw.replace(/[.,;:!?)\]>]+$/g, "");
  if (!trimmed) return undefined;
  try {
    if (trimmed.startsWith("zoommtg://")) {
      return trimmed;
    }
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export function extractUrls(text: string): string[] {
  const corpus = stripHtml(text);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of corpus.matchAll(URL_RE)) {
    const candidate = sanitizeCandidate(match[1] ?? "");
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    found.push(candidate);
  }
  // Also pull href="..." before stripping in case strip lost them — re-scan original
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(hrefRe)) {
    const candidate = sanitizeCandidate(match[1] ?? "");
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    found.push(candidate);
  }
  return found;
}
