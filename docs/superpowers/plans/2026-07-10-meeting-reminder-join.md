# Meeting Reminder Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Thunderbird MailExtension that detects online meeting links in calendar events and surfaces Join Meeting / Copy Link from reminders via hexagonal architecture and a plugin-style provider registry.

**Architecture:** Domain and application layers own detection and actions with zero Thunderbird imports. Ports define calendar/reminder/browser/clipboard boundaries. Thunderbird adapters implement those ports; a hybrid presenter tries native enhancement then falls back to a Native List Row companion window (meeting-link reminders only). Providers register into `MeetingProviderRegistry`; the parser never hardcodes vendor logic.

**Tech Stack:** TypeScript, Vitest, esbuild (bundle extension entrypoints), Thunderbird 128+ ESR MailExtensions (Manifest V3), Node.js 20+ for build/test.

**Spec:** `docs/superpowers/specs/2026-07-10-meeting-reminder-join-design.md`

---

## File structure

| Path | Responsibility |
| --- | --- |
| `package.json` | Scripts: `test`, `build`, `package` |
| `tsconfig.json` | Strict TS for `src` + `tests` |
| `vitest.config.ts` | Unit test config |
| `esbuild.config.mjs` | Bundle background + companion into `dist/extension` |
| `src/domain/calendar-event-fields.ts` | Read-only event field DTO |
| `src/domain/meeting-link.ts` | Detected link value object |
| `src/domain/meeting-provider.ts` | Provider interface |
| `src/domain/meeting-detection-result.ts` | Primary + alternatives |
| `src/domain/meeting-provider-registry.ts` | Registry match/resolve |
| `src/domain/extract-urls.ts` | HTML strip + URL extraction |
| `src/domain/providers/*.ts` | One file per provider |
| `src/domain/providers/index.ts` | `createDefaultProviders()` |
| `src/application/detect-meeting-link.ts` | Detection use case |
| `src/application/resolve-reminder-action.ts` | Presentable action DTO |
| `src/application/join-meeting.ts` | Open URL |
| `src/application/copy-meeting-link.ts` | Copy URL |
| `src/application/handle-reminder.ts` | Orchestrate detect → resolve → present |
| `src/ports/*.ts` | Port interfaces |
| `src/adapters/fake/*.ts` | Test doubles |
| `src/adapters/thunderbird/*.ts` | TB adapters |
| `src/composition/root.ts` | Wire registry, use cases, adapters |
| `src/extension/manifest.json` | MailExtension manifest |
| `src/extension/background.ts` | Reminder listener entry |
| `src/extension/companion/companion.html` | Native List Row UI shell |
| `src/extension/companion/companion.css` | Companion styles |
| `src/extension/companion/companion.ts` | Companion UI logic |
| `src/extension/icons/` | Extension + provider icon placeholders |
| `tests/**` | Vitest unit tests mirroring layers |
| `scripts/package-xpi.mjs` | Zip `dist/extension` → `.xpi` |
| `README.md` | Full developer documentation |

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.npmrc`
- Modify: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "thunderbird-meeting-toolkit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "node esbuild.config.mjs",
    "typecheck": "tsc --noEmit",
    "package": "npm run build && node scripts/package-xpi.mjs"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": ".",
    "outDir": "dist/tsc",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `.npmrc` with `ignore-scripts=true`**

```
ignore-scripts=true
```

- [ ] **Step 5: Ensure `.gitignore` includes build artifacts**

```
.superpowers/
node_modules/
dist/
*.xpi
.DS_Store
coverage/
*.log
```

- [ ] **Step 6: Freshness-check then install (with `--ignore-scripts`)**

For each of `typescript`, `vitest`, `esbuild`, `@types/node`, verify published age ≥ 72h via:

```bash
curl -s https://registry.npmjs.org/typescript | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);const v=j["dist-tags"].latest;const t=new Date(j.time[v]);console.log(v,(Date.now()-t)/36e5,"hours")})'
```

Repeat for `vitest`, `esbuild`, `@types/node`. If any package is < 72h old, pin an older version ≥ 72h.

Then:

```bash
npm install --ignore-scripts
```

Expected: `node_modules` populated; lockfile created.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .npmrc .gitignore
git commit -m "chore: scaffold TypeScript project with Vitest"
```

---

### Task 2: Domain types — MeetingLink, provider interface, detection result, event fields

**Files:**
- Create: `src/domain/calendar-event-fields.ts`
- Create: `src/domain/meeting-link.ts`
- Create: `src/domain/meeting-provider.ts`
- Create: `src/domain/meeting-detection-result.ts`
- Test: `tests/domain/meeting-detection-result.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/domain/meeting-detection-result.test.ts
```

Expected: FAIL — module not found / `MeetingDetectionResult` undefined.

- [ ] **Step 3: Write minimal domain types**

```ts
// src/domain/calendar-event-fields.ts
export interface CalendarEventFields {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  plainBody?: string;
  htmlBody?: string;
}
```

```ts
// src/domain/meeting-link.ts
export interface MeetingLink {
  providerId: string;
  displayName: string;
  url: string;
  icon?: string;
}
```

```ts
// src/domain/meeting-provider.ts
export interface MeetingProvider {
  readonly id: string;
  readonly displayName: string;
  readonly icon: string;
  readonly detectionPatterns: readonly RegExp[];
  validate(url: string): boolean;
  normalize(url: string): string;
}
```

```ts
// src/domain/meeting-detection-result.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/domain/meeting-detection-result.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/domain
git commit -m "feat: add core domain types for meeting detection"
```

---

### Task 3: URL extraction (HTML + plain text)

**Files:**
- Create: `src/domain/extract-urls.ts`
- Test: `tests/domain/extract-urls.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/extract-urls.test.ts
import { describe, expect, it } from "vitest";
import { extractUrls, stripHtml } from "../../src/domain/extract-urls.js";

describe("stripHtml", () => {
  it("removes tags and decodes basic entities", () => {
    expect(stripHtml('<p>Join <a href="https://meet.google.com/abc-defg-hij">here</a></p>')).toContain(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(stripHtml("A&amp;B")).toBe("A&B");
  });
});

describe("extractUrls", () => {
  it("extracts https urls from plain text with whitespace", () => {
    const urls = extractUrls("See  https://zoom.us/j/123456789  thanks");
    expect(urls).toEqual(["https://zoom.us/j/123456789"]);
  });

  it("extracts urls from HTML hrefs and visible text", () => {
    const urls = extractUrls(
      '<div>Click <a href="https://teams.microsoft.com/l/meetup-join/xyz">Teams</a></div>',
    );
    expect(urls).toContain("https://teams.microsoft.com/l/meetup-join/xyz");
  });

  it("ignores malformed urls and unrelated noise", () => {
    const urls = extractUrls("broken http:// and also not-a-url ftp://files.example/x");
    expect(urls.every((u) => u.startsWith("http") || u.includes("://"))).toBe(true);
  });

  it("extracts zoommtg protocol links", () => {
    const urls = extractUrls("Open zoommtg://zoom.us/join?action=join&confno=123");
    expect(urls.some((u) => u.startsWith("zoommtg://"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/domain/extract-urls.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement extraction**

```ts
// src/domain/extract-urls.ts
const URL_RE =
  /\b((?:https?:\/\/|zoommtg:\/\/)[^\s<>"'()\[\]{}]+)/gi;

export function stripHtml(input: string): string {
  const withoutTags = input
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/domain/extract-urls.test.ts
```

Expected: PASS. Adjust `sanitizeCandidate` / regex if a case fails — keep behavior: ignore malformed, keep zoommtg, keep https.

- [ ] **Step 5: Commit**

```bash
git add src/domain/extract-urls.ts tests/domain/extract-urls.test.ts
git commit -m "feat: extract meeting URLs from plain text and HTML"
```

---

### Task 4: MeetingProviderRegistry

**Files:**
- Create: `src/domain/meeting-provider-registry.ts`
- Test: `tests/domain/meeting-provider-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/domain/meeting-provider-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement registry**

```ts
// src/domain/meeting-provider-registry.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/domain/meeting-provider-registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/meeting-provider-registry.ts tests/domain/meeting-provider-registry.test.ts
git commit -m "feat: add MeetingProviderRegistry for plugin matching"
```

---

### Task 5: Provider plugins (all eight)

**Files:**
- Create: `src/domain/providers/zoom.ts`
- Create: `src/domain/providers/teams.ts`
- Create: `src/domain/providers/google-meet.ts`
- Create: `src/domain/providers/webex.ts`
- Create: `src/domain/providers/goto.ts`
- Create: `src/domain/providers/slack.ts`
- Create: `src/domain/providers/discord.ts`
- Create: `src/domain/providers/jitsi.ts`
- Create: `src/domain/providers/index.ts`
- Create: `src/domain/providers/create-provider.ts` (shared helpers)
- Test: `tests/providers/providers.test.ts`

- [ ] **Step 1: Write the failing provider suite**

```ts
// tests/providers/providers.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/providers/providers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement shared helper + each provider**

```ts
// src/domain/providers/create-provider.ts
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
```

```ts
// src/domain/providers/zoom.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const zoomProvider = createProvider({
  id: "zoom",
  displayName: "Zoom",
  icon: "zoom",
  detectionPatterns: [
    /^zoommtg:\/\//i,
    /^https?:\/\/([\w-]+\.)?zoom\.us\/j\//i,
  ],
  validate: (url) => {
    if (url.toLowerCase().startsWith("zoommtg://")) return true;
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return /(\.|^)zoom\.us$/i.test(u.hostname) && /\/j\//i.test(u.pathname);
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/teams.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const teamsProvider = createProvider({
  id: "teams",
  displayName: "Microsoft Teams",
  icon: "teams",
  detectionPatterns: [/^https?:\/\/([\w.-]+\.)?teams\.microsoft\.(com|us)\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return /(^|\.)teams\.microsoft\.(com|us)$/i.test(u.hostname);
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/google-meet.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const googleMeetProvider = createProvider({
  id: "google-meet",
  displayName: "Google Meet",
  icon: "google-meet",
  detectionPatterns: [/^https?:\/\/meet\.google\.com\/[a-z0-9-]+/i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return (
        u.hostname.toLowerCase() === "meet.google.com" &&
        /^\/[a-z0-9-]+/i.test(u.pathname)
      );
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/webex.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const webexProvider = createProvider({
  id: "webex",
  displayName: "Cisco Webex",
  icon: "webex",
  detectionPatterns: [/^https?:\/\/([\w.-]+\.)?webex\.com\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return /(^|\.)webex\.com$/i.test(u.hostname);
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/goto.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const gotoProvider = createProvider({
  id: "goto",
  displayName: "GoTo Meeting",
  icon: "goto",
  detectionPatterns: [/^https?:\/\/meet\.goto\.com\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      return new URL(url).hostname.toLowerCase() === "meet.goto.com";
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/slack.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const slackProvider = createProvider({
  id: "slack",
  displayName: "Slack",
  icon: "slack",
  detectionPatterns: [/^https?:\/\/app\.slack\.com\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return (
        u.hostname.toLowerCase() === "app.slack.com" &&
        (/^\/huddle\//i.test(u.pathname) || /^\/client\//i.test(u.pathname))
      );
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/discord.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const discordProvider = createProvider({
  id: "discord",
  displayName: "Discord",
  icon: "discord",
  detectionPatterns: [
    /^https?:\/\/(www\.)?discord\.gg\//i,
    /^https?:\/\/(www\.)?discord\.com\/(invite|channels)\//i,
  ],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host === "discord.gg" || host === "www.discord.gg") return u.pathname.length > 1;
      if (host === "discord.com" || host === "www.discord.com") {
        return /^\/(invite|channels)\//i.test(u.pathname);
      }
      return false;
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/jitsi.ts
import { createProvider, isHttpUrl } from "./create-provider.js";

export const jitsiProvider = createProvider({
  id: "jitsi",
  displayName: "Jitsi Meet",
  icon: "jitsi",
  detectionPatterns: [/^https?:\/\/meet\.jit\.si\//i],
  validate: (url) => {
    if (!isHttpUrl(url)) return false;
    try {
      const u = new URL(url);
      return u.hostname.toLowerCase() === "meet.jit.si" && u.pathname.length > 1;
    } catch {
      return false;
    }
  },
});
```

```ts
// src/domain/providers/index.ts
import type { MeetingProvider } from "../meeting-provider.js";
import { discordProvider } from "./discord.js";
import { googleMeetProvider } from "./google-meet.js";
import { gotoProvider } from "./goto.js";
import { jitsiProvider } from "./jitsi.js";
import { slackProvider } from "./slack.js";
import { teamsProvider } from "./teams.js";
import { webexProvider } from "./webex.js";
import { zoomProvider } from "./zoom.js";

export function createDefaultProviders(): MeetingProvider[] {
  return [
    zoomProvider,
    teamsProvider,
    googleMeetProvider,
    webexProvider,
    gotoProvider,
    slackProvider,
    discordProvider,
    jitsiProvider,
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/providers/providers.test.ts
```

Expected: PASS. If Teams gov URL fails, broaden hostname pattern; if Zoom pricing matched, tighten `validate`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/providers tests/providers
git commit -m "feat: add eight meeting provider plugins"
```

---

### Task 6: DetectMeetingLink use case

**Files:**
- Create: `src/application/detect-meeting-link.ts`
- Test: `tests/application/detect-meeting-link.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/application/detect-meeting-link.test.ts
import { describe, expect, it } from "vitest";
import { DetectMeetingLink } from "../../src/application/detect-meeting-link.js";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../../src/domain/providers/index.js";
import type { CalendarEventFields } from "../../src/domain/calendar-event-fields.js";

function event(partial: Partial<CalendarEventFields>): CalendarEventFields {
  return {
    id: "e1",
    title: "Sync",
    start: new Date("2026-07-10T18:00:00Z"),
    ...partial,
  };
}

describe("DetectMeetingLink", () => {
  const detect = new DetectMeetingLink(
    new MeetingProviderRegistry(createDefaultProviders()),
  );

  it("finds a link in location", () => {
    const result = detect.execute(
      event({ location: "https://meet.google.com/abc-defg-hij" }),
    );
    expect(result.primary?.providerId).toBe("google-meet");
  });

  it("finds a link in HTML description", () => {
    const result = detect.execute(
      event({
        htmlBody:
          '<p>Join <a href="https://zoom.us/j/999">Zoom</a></p>',
      }),
    );
    expect(result.primary?.providerId).toBe("zoom");
  });

  it("returns multiple detections in document order", () => {
    const result = detect.execute(
      event({
        description:
          "Zoom https://zoom.us/j/1 then Meet https://meet.google.com/abc-defg-hij",
      }),
    );
    expect(result.all.map((l) => l.providerId)).toEqual(["zoom", "google-meet"]);
  });

  it("ignores unknown and invalid urls", () => {
    const result = detect.execute(
      event({
        description: "https://example.com/x and https://zoom.us/pricing",
      }),
    );
    expect(result.isEmpty).toBe(true);
  });

  it("dedupes identical normalized urls", () => {
    const result = detect.execute(
      event({
        location: "https://zoom.us/j/1",
        description: "https://zoom.us/j/1",
      }),
    );
    expect(result.all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/application/detect-meeting-link.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement use case**

```ts
// src/application/detect-meeting-link.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/application/detect-meeting-link.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/detect-meeting-link.ts tests/application/detect-meeting-link.test.ts
git commit -m "feat: detect meeting links from calendar event fields"
```

---

### Task 7: ResolveReminderAction, JoinMeeting, CopyMeetingLink

**Files:**
- Create: `src/ports/browser-launcher.ts`
- Create: `src/ports/clipboard-service.ts`
- Create: `src/adapters/fake/fake-browser-launcher.ts`
- Create: `src/adapters/fake/fake-clipboard-service.ts`
- Create: `src/application/resolve-reminder-action.ts`
- Create: `src/application/join-meeting.ts`
- Create: `src/application/copy-meeting-link.ts`
- Test: `tests/application/reminder-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/application/reminder-actions.test.ts
import { describe, expect, it } from "vitest";
import { CopyMeetingLink } from "../../src/application/copy-meeting-link.js";
import { JoinMeeting } from "../../src/application/join-meeting.js";
import { ResolveReminderAction } from "../../src/application/resolve-reminder-action.js";
import { FakeBrowserLauncher } from "../../src/adapters/fake/fake-browser-launcher.js";
import { FakeClipboardService } from "../../src/adapters/fake/fake-clipboard-service.js";
import { MeetingDetectionResult } from "../../src/domain/meeting-detection-result.js";
import type { CalendarEventFields } from "../../src/domain/calendar-event-fields.js";

const event: CalendarEventFields = {
  id: "e1",
  title: "Sprint Planning",
  start: new Date("2026-07-10T20:00:00Z"),
  end: new Date("2026-07-10T20:30:00Z"),
};

const detection = MeetingDetectionResult.from([
  {
    providerId: "google-meet",
    displayName: "Google Meet",
    url: "https://meet.google.com/abc-defg-hij",
    icon: "google-meet",
  },
  {
    providerId: "zoom",
    displayName: "Zoom",
    url: "https://zoom.us/j/1",
    icon: "zoom",
  },
]);

describe("ResolveReminderAction", () => {
  it("maps event + detection to a presentable action", () => {
    const action = new ResolveReminderAction().execute(event, detection);
    expect(action).toEqual({
      eventId: "e1",
      title: "Sprint Planning",
      start: event.start,
      end: event.end,
      primary: detection.primary,
      alternatives: detection.alternatives,
    });
  });

  it("returns null when detection is empty", () => {
    expect(
      new ResolveReminderAction().execute(event, MeetingDetectionResult.from([])),
    ).toBeNull();
  });
});

describe("JoinMeeting", () => {
  it("opens the selected url", async () => {
    const browser = new FakeBrowserLauncher();
    await new JoinMeeting(browser).execute("https://meet.google.com/abc-defg-hij");
    expect(browser.opened).toEqual(["https://meet.google.com/abc-defg-hij"]);
  });
});

describe("CopyMeetingLink", () => {
  it("writes the url to the clipboard", async () => {
    const clipboard = new FakeClipboardService();
    await new CopyMeetingLink(clipboard).execute("https://zoom.us/j/1");
    expect(clipboard.texts).toEqual(["https://zoom.us/j/1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/application/reminder-actions.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ports, fakes, and use cases**

```ts
// src/ports/browser-launcher.ts
export interface BrowserLauncher {
  open(url: string): Promise<void>;
}
```

```ts
// src/ports/clipboard-service.ts
export interface ClipboardService {
  writeText(text: string): Promise<void>;
}
```

```ts
// src/adapters/fake/fake-browser-launcher.ts
import type { BrowserLauncher } from "../../ports/browser-launcher.js";

export class FakeBrowserLauncher implements BrowserLauncher {
  readonly opened: string[] = [];
  failNext = false;

  async open(url: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("launch failed");
    }
    this.opened.push(url);
  }
}
```

```ts
// src/adapters/fake/fake-clipboard-service.ts
import type { ClipboardService } from "../../ports/clipboard-service.js";

export class FakeClipboardService implements ClipboardService {
  readonly texts: string[] = [];
  failNext = false;

  async writeText(text: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("clipboard failed");
    }
    this.texts.push(text);
  }
}
```

```ts
// src/application/resolve-reminder-action.ts
import type { CalendarEventFields } from "../domain/calendar-event-fields.js";
import type { MeetingDetectionResult } from "../domain/meeting-detection-result.js";
import type { MeetingLink } from "../domain/meeting-link.js";

export interface ReminderAction {
  eventId: string;
  title: string;
  start: Date;
  end?: Date;
  primary: MeetingLink;
  alternatives: readonly MeetingLink[];
}

export class ResolveReminderAction {
  execute(
    event: CalendarEventFields,
    detection: MeetingDetectionResult,
  ): ReminderAction | null {
    if (detection.isEmpty || !detection.primary) return null;
    return {
      eventId: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      primary: detection.primary,
      alternatives: detection.alternatives,
    };
  }
}
```

```ts
// src/application/join-meeting.ts
import type { BrowserLauncher } from "../ports/browser-launcher.js";

export class JoinMeeting {
  constructor(private readonly browser: BrowserLauncher) {}

  execute(url: string): Promise<void> {
    return this.browser.open(url);
  }
}
```

```ts
// src/application/copy-meeting-link.ts
import type { ClipboardService } from "../ports/clipboard-service.js";

export class CopyMeetingLink {
  constructor(private readonly clipboard: ClipboardService) {}

  execute(url: string): Promise<void> {
    return this.clipboard.writeText(url);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/application/reminder-actions.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ports src/adapters/fake src/application tests/application/reminder-actions.test.ts
git commit -m "feat: add resolve, join, and copy reminder actions"
```

---

### Task 8: HandleReminder orchestration + hybrid presenter port

**Files:**
- Create: `src/ports/calendar-repository.ts`
- Create: `src/ports/reminder-presenter.ts`
- Create: `src/adapters/fake/fake-calendar-repository.ts`
- Create: `src/adapters/fake/fake-reminder-presenter.ts`
- Create: `src/application/handle-reminder.ts`
- Create: `src/adapters/thunderbird/hybrid-reminder-presenter.ts` (testable core without `browser` — accept native + companion delegates)
- Test: `tests/application/handle-reminder.test.ts`
- Test: `tests/adapters/hybrid-reminder-presenter.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

```ts
// tests/application/handle-reminder.test.ts
import { describe, expect, it } from "vitest";
import { DetectMeetingLink } from "../../src/application/detect-meeting-link.js";
import { HandleReminder } from "../../src/application/handle-reminder.js";
import { ResolveReminderAction } from "../../src/application/resolve-reminder-action.js";
import { FakeCalendarRepository } from "../../src/adapters/fake/fake-calendar-repository.js";
import { FakeReminderPresenter } from "../../src/adapters/fake/fake-reminder-presenter.js";
import { MeetingProviderRegistry } from "../../src/domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../../src/domain/providers/index.js";

describe("HandleReminder", () => {
  it("presents an action when a meeting link exists", async () => {
    const calendar = new FakeCalendarRepository([
      {
        id: "e1",
        title: "Sync",
        start: new Date("2026-07-10T20:00:00Z"),
        location: "https://meet.google.com/abc-defg-hij",
      },
    ]);
    const presenter = new FakeReminderPresenter();
    const handle = new HandleReminder(
      calendar,
      new DetectMeetingLink(new MeetingProviderRegistry(createDefaultProviders())),
      new ResolveReminderAction(),
      presenter,
    );

    await handle.execute("e1");
    expect(presenter.presented).toHaveLength(1);
    expect(presenter.presented[0]?.primary.providerId).toBe("google-meet");
  });

  it("stays invisible when no meeting link exists", async () => {
    const calendar = new FakeCalendarRepository([
      {
        id: "e2",
        title: "Focus time",
        start: new Date("2026-07-10T20:00:00Z"),
        location: "Conference Room A",
      },
    ]);
    const presenter = new FakeReminderPresenter();
    const handle = new HandleReminder(
      calendar,
      new DetectMeetingLink(new MeetingProviderRegistry(createDefaultProviders())),
      new ResolveReminderAction(),
      presenter,
    );

    await handle.execute("e2");
    expect(presenter.presented).toHaveLength(0);
    expect(presenter.hiddenCalls).toBe(1);
  });

  it("stays silent when event load fails", async () => {
    const calendar = new FakeCalendarRepository([]);
    const presenter = new FakeReminderPresenter();
    const handle = new HandleReminder(
      calendar,
      new DetectMeetingLink(new MeetingProviderRegistry(createDefaultProviders())),
      new ResolveReminderAction(),
      presenter,
    );

    await handle.execute("missing");
    expect(presenter.presented).toHaveLength(0);
  });
});
```

```ts
// tests/adapters/hybrid-reminder-presenter.test.ts
import { describe, expect, it } from "vitest";
import { HybridReminderPresenter } from "../../src/adapters/thunderbird/hybrid-reminder-presenter.js";
import { FakeReminderPresenter } from "../../src/adapters/fake/fake-reminder-presenter.js";
import type { ReminderAction } from "../../src/application/resolve-reminder-action.js";

const action: ReminderAction = {
  eventId: "e1",
  title: "Sync",
  start: new Date("2026-07-10T20:00:00Z"),
  primary: {
    providerId: "zoom",
    displayName: "Zoom",
    url: "https://zoom.us/j/1",
    icon: "zoom",
  },
  alternatives: [],
};

describe("HybridReminderPresenter", () => {
  it("uses native when native.canPresent is true", async () => {
    const native = new FakeReminderPresenter({ canPresent: true });
    const companion = new FakeReminderPresenter({ canPresent: true });
    const hybrid = new HybridReminderPresenter(native, companion);
    await hybrid.present(action);
    expect(native.presented).toHaveLength(1);
    expect(companion.presented).toHaveLength(0);
  });

  it("falls back to companion when native cannot present", async () => {
    const native = new FakeReminderPresenter({ canPresent: false });
    const companion = new FakeReminderPresenter({ canPresent: true });
    const hybrid = new HybridReminderPresenter(native, companion);
    await hybrid.present(action);
    expect(native.presented).toHaveLength(0);
    expect(companion.presented).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/application/handle-reminder.test.ts tests/adapters/hybrid-reminder-presenter.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ports, fakes, HandleReminder, HybridReminderPresenter**

```ts
// src/ports/calendar-repository.ts
import type { CalendarEventFields } from "../domain/calendar-event-fields.js";

export interface CalendarRepository {
  getEvent(eventId: string): Promise<CalendarEventFields | null>;
}
```

```ts
// src/ports/reminder-presenter.ts
import type { ReminderAction } from "../application/resolve-reminder-action.js";

export interface ReminderPresenter {
  canPresent(): Promise<boolean>;
  present(action: ReminderAction): Promise<void>;
  hide(): Promise<void>;
}
```

```ts
// src/adapters/fake/fake-calendar-repository.ts
import type { CalendarEventFields } from "../../domain/calendar-event-fields.js";
import type { CalendarRepository } from "../../ports/calendar-repository.js";

export class FakeCalendarRepository implements CalendarRepository {
  constructor(private readonly events: CalendarEventFields[]) {}

  async getEvent(eventId: string): Promise<CalendarEventFields | null> {
    return this.events.find((e) => e.id === eventId) ?? null;
  }
}
```

```ts
// src/adapters/fake/fake-reminder-presenter.ts
import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

export class FakeReminderPresenter implements ReminderPresenter {
  readonly presented: ReminderAction[] = [];
  hiddenCalls = 0;

  constructor(private readonly options: { canPresent?: boolean } = {}) {}

  async canPresent(): Promise<boolean> {
    return this.options.canPresent ?? true;
  }

  async present(action: ReminderAction): Promise<void> {
    this.presented.push(action);
  }

  async hide(): Promise<void> {
    this.hiddenCalls += 1;
  }
}
```

```ts
// src/application/handle-reminder.ts
import type { DetectMeetingLink } from "./detect-meeting-link.js";
import type { ResolveReminderAction } from "./resolve-reminder-action.js";
import type { CalendarRepository } from "../ports/calendar-repository.js";
import type { ReminderPresenter } from "../ports/reminder-presenter.js";

export class HandleReminder {
  constructor(
    private readonly calendar: CalendarRepository,
    private readonly detect: DetectMeetingLink,
    private readonly resolve: ResolveReminderAction,
    private readonly presenter: ReminderPresenter,
  ) {}

  async execute(eventId: string): Promise<void> {
    let event;
    try {
      event = await this.calendar.getEvent(eventId);
    } catch {
      return;
    }
    if (!event) return;

    const detection = this.detect.execute(event);
    const action = this.resolve.execute(event, detection);
    if (!action) {
      await this.presenter.hide();
      return;
    }
    await this.presenter.present(action);
  }
}
```

```ts
// src/adapters/thunderbird/hybrid-reminder-presenter.ts
import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

export class HybridReminderPresenter implements ReminderPresenter {
  constructor(
    private readonly native: ReminderPresenter,
    private readonly companion: ReminderPresenter,
  ) {}

  async canPresent(): Promise<boolean> {
    return (
      (await this.native.canPresent()) || (await this.companion.canPresent())
    );
  }

  async present(action: ReminderAction): Promise<void> {
    if (await this.native.canPresent()) {
      await this.native.present(action);
      return;
    }
    await this.companion.present(action);
  }

  async hide(): Promise<void> {
    await this.native.hide();
    await this.companion.hide();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/application/handle-reminder.test.ts tests/adapters/hybrid-reminder-presenter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ports src/adapters src/application/handle-reminder.ts tests/application/handle-reminder.test.ts tests/adapters
git commit -m "feat: orchestrate reminder handling with hybrid presenter"
```

---

### Task 9: Build pipeline + extension manifest shell

**Files:**
- Create: `esbuild.config.mjs`
- Create: `scripts/package-xpi.mjs`
- Create: `src/extension/manifest.json`
- Create: `src/extension/icons/icon-48.png` (simple placeholder PNG)
- Create: `src/extension/background.ts` (stub that imports composition later)
- Create: `src/extension/companion/companion.html`
- Create: `src/extension/companion/companion.css`
- Create: `src/extension/companion/companion.ts`

- [ ] **Step 1: Create `esbuild.config.mjs`**

```js
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)));
const outdir = join(root, "dist/extension");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await esbuild.build({
  entryPoints: {
    background: join(root, "src/extension/background.ts"),
    "companion/companion": join(root, "src/extension/companion/companion.ts"),
  },
  bundle: true,
  outdir,
  format: "esm",
  target: ["firefox128"],
  sourcemap: true,
  logLevel: "info",
});

cpSync(join(root, "src/extension/manifest.json"), join(outdir, "manifest.json"));
cpSync(
  join(root, "src/extension/companion/companion.html"),
  join(outdir, "companion/companion.html"),
);
cpSync(
  join(root, "src/extension/companion/companion.css"),
  join(outdir, "companion/companion.css"),
);
cpSync(join(root, "src/extension/icons"), join(outdir, "icons"), {
  recursive: true,
});
```

- [ ] **Step 2: Create manifest (MV3 MailExtension)**

```json
{
  "manifest_version": 3,
  "name": "Meeting Reminder Join",
  "version": "0.1.0",
  "description": "Join online meetings directly from Thunderbird calendar reminders.",
  "browser_specific_settings": {
    "gecko": {
      "id": "meeting-reminder-join@thunderbird-meeting-toolkit.local",
      "strict_min_version": "128.0"
    }
  },
  "permissions": ["storage", "clipboardWrite", "notifications"],
  "host_permissions": [],
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "icons": {
    "48": "icons/icon-48.png"
  }
}
```

Note: During implementation, if Thunderbird 128 calendar reminder APIs require additional permissions (e.g. `experiments` or calendar permission strings documented for the installed TB version), add only the minimum required permissions and document them in README. Do not invent write access to calendar events.

- [ ] **Step 3: Create companion shell files**

`companion.html` — Native List Row structure with `#reminder-list`, join/copy/dismiss controls, provider chip + `<select>` for alternatives.

`companion.css` — styles matching the approved mockup (list header, row, green chip example tokens via CSS variables per provider class).

`companion.ts` — read `browser.runtime` message / URL query for `ReminderAction` JSON; wire Join/Copy/Dismiss buttons; on provider `<select>` change, update primary URL used by Join/Copy.

`background.ts` — temporary stub:

```ts
console.log("Meeting Reminder Join background loaded");
```

- [ ] **Step 4: Create `scripts/package-xpi.mjs`**

Zip contents of `dist/extension` into `dist/meeting-reminder-join-0.1.0.xpi` using `node:zlib` + `node:fs` or a tiny zip implementation without new deps if possible. Prefer Node built-ins:

```js
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
execFileSync("zip", ["-r", "../meeting-reminder-join-0.1.0.xpi", "."], {
  cwd: "dist/extension",
  stdio: "inherit",
});
```

- [ ] **Step 5: Generate a minimal 48×48 PNG placeholder**

Use a tiny valid PNG (solid color) written via Node buffer or commit a small binary asset under `src/extension/icons/icon-48.png`.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: `dist/extension/background.js`, companion assets, `manifest.json` present.

- [ ] **Step 7: Commit**

```bash
git add esbuild.config.mjs scripts src/extension
git commit -m "chore: add extension build pipeline and companion shell"
```

---

### Task 10: Thunderbird adapters + composition root + background wiring

**Files:**
- Create: `src/adapters/thunderbird/browser-launcher.ts`
- Create: `src/adapters/thunderbird/clipboard-service.ts`
- Create: `src/adapters/thunderbird/calendar-repository.ts`
- Create: `src/adapters/thunderbird/native-reminder-presenter.ts`
- Create: `src/adapters/thunderbird/companion-reminder-presenter.ts`
- Create: `src/composition/root.ts`
- Modify: `src/extension/background.ts`
- Modify: `src/extension/companion/companion.ts`
- Modify: `src/extension/manifest.json` (permissions / calendar APIs as required)
- Test: `tests/adapters/thunderbird-mappers.test.ts` (pure mapping helpers if extracted)

- [ ] **Step 1: Implement thin TB wrappers**

```ts
// src/adapters/thunderbird/browser-launcher.ts
import type { BrowserLauncher } from "../../ports/browser-launcher.js";

declare const browser: {
  tabs?: { create(createProperties: { url: string }): Promise<unknown> };
};

export class ThunderbirdBrowserLauncher implements BrowserLauncher {
  async open(url: string): Promise<void> {
    if (!browser.tabs?.create) throw new Error("tabs API unavailable");
    await browser.tabs.create({ url });
  }
}
```

```ts
// src/adapters/thunderbird/clipboard-service.ts
import type { ClipboardService } from "../../ports/clipboard-service.js";

export class ThunderbirdClipboardService implements ClipboardService {
  async writeText(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      throw new Error("clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
  }
}
```

- [ ] **Step 2: Implement calendar repository**

Map Thunderbird calendar event objects to `CalendarEventFields`. Prefer official WebExtension calendar APIs available in TB 128+ (`browser.calendar` / messenger calendar APIs as documented for the target version). Extract:

- `id`, `title`, `start`, `end`
- `location`
- `description` / `plainBody` / `htmlBody` from whichever fields the API exposes

If the installed API shape differs, isolate mapping in `mapThunderbirdEvent(raw): CalendarEventFields` and unit-test that mapper with fixture JSON (no live TB).

`getEvent` returns `null` on missing; never throws to callers of `HandleReminder` except unexpected errors (which HandleReminder already swallows).

- [ ] **Step 3: Native presenter**

```ts
// src/adapters/thunderbird/native-reminder-presenter.ts
import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

/**
 * Attempts to enhance Thunderbird's native reminder UI.
 * v1: return canPresent() === false unless a stable WebExtension API
 * exists to inject Join controls. Prefer correctness over fragile hooks.
 */
export class NativeReminderPresenter implements ReminderPresenter {
  async canPresent(): Promise<boolean> {
    return false;
  }

  async present(_action: ReminderAction): Promise<void> {
    // no-op until a supported native injection API is available
  }

  async hide(): Promise<void> {}
}
```

Document in README that native enhancement is capability-detected; companion is the supported path today.

- [ ] **Step 4: Companion presenter**

Open (or focus) the companion window/panel with the `ReminderAction` payload (via `browser.windows.create` pointing at `companion/companion.html` + query param, or `runtime.sendMessage`). Meeting-only: only call `present` when `HandleReminder` already filtered empty detections.

Companion UI requirements:

- Title, relative time (“in 5 min”), optional end range
- Provider chip with displayName + icon class
- `<select>` visible when `alternatives.length > 0`
- Buttons: Join Meeting, Copy, Dismiss
- Join → message background to run `JoinMeeting`
- Copy → message background to run `CopyMeetingLink`
- Dismiss → close window; no calendar writes

- [ ] **Step 5: Composition root**

```ts
// src/composition/root.ts
import { CopyMeetingLink } from "../application/copy-meeting-link.js";
import { DetectMeetingLink } from "../application/detect-meeting-link.js";
import { HandleReminder } from "../application/handle-reminder.js";
import { JoinMeeting } from "../application/join-meeting.js";
import { ResolveReminderAction } from "../application/resolve-reminder-action.js";
import { HybridReminderPresenter } from "../adapters/thunderbird/hybrid-reminder-presenter.js";
import { CompanionReminderPresenter } from "../adapters/thunderbird/companion-reminder-presenter.js";
import { NativeReminderPresenter } from "../adapters/thunderbird/native-reminder-presenter.js";
import { ThunderbirdBrowserLauncher } from "../adapters/thunderbird/browser-launcher.js";
import { ThunderbirdCalendarRepository } from "../adapters/thunderbird/calendar-repository.js";
import { ThunderbirdClipboardService } from "../adapters/thunderbird/clipboard-service.js";
import { MeetingProviderRegistry } from "../domain/meeting-provider-registry.js";
import { createDefaultProviders } from "../domain/providers/index.js";

export function createApp() {
  const registry = new MeetingProviderRegistry(createDefaultProviders());
  const detect = new DetectMeetingLink(registry);
  const resolve = new ResolveReminderAction();
  const calendar = new ThunderbirdCalendarRepository();
  const presenter = new HybridReminderPresenter(
    new NativeReminderPresenter(),
    new CompanionReminderPresenter(),
  );
  const browser = new ThunderbirdBrowserLauncher();
  const clipboard = new ThunderbirdClipboardService();

  return {
    registry,
    handleReminder: new HandleReminder(calendar, detect, resolve, presenter),
    joinMeeting: new JoinMeeting(browser),
    copyMeetingLink: new CopyMeetingLink(clipboard),
  };
}
```

- [ ] **Step 6: Wire background**

On load, `const app = createApp()`. Subscribe to calendar reminder events (API name per TB docs — e.g. alarm/reminder listener). For each fired reminder event id, `await app.handleReminder.execute(eventId)`.

On runtime messages:

- `{ type: "join", url }` → `app.joinMeeting.execute(url)` (catch errors; notify lightly)
- `{ type: "copy", url }` → `app.copyMeetingLink.execute(url)` (catch errors; notify lightly)

- [ ] **Step 7: Add mapper unit test if mapper extracted**

Fixture-based test ensuring location/description/html map into `CalendarEventFields` correctly.

- [ ] **Step 8: Run full unit suite + build**

```bash
npm test && npm run build
```

Expected: all tests PASS; `dist/extension` built.

- [ ] **Step 9: Commit**

```bash
git add src/adapters/thunderbird src/composition src/extension tests
git commit -m "feat: wire Thunderbird adapters and reminder background flow"
```

---

### Task 11: README + packaging verification

**Files:**
- Create: `README.md`
- Modify: `package.json` if script tweaks needed

- [ ] **Step 1: Write README covering all required sections**

Must include:

1. Project overview  
2. Features  
3. Supported meeting providers  
4. Architecture diagram (mermaid or ASCII matching the spec)  
5. Clean Architecture explanation  
6. Hexagonal Architecture explanation  
7. Folder structure walkthrough  
8. Thunderbird setup (128+ ESR)  
9. Local development (`npm install --ignore-scripts`, `npm test`, `npm run build`)  
10. Build instructions  
11. Temporary extension installation (Thunderbird → Add-ons → Debug Add-ons → Load Temporary Add-on → select `dist/extension/manifest.json`)  
12. Packaging (`npm run package` → `.xpi`)  
13. Running tests  
14. Debugging (background console via about:debugging)  
15. Adding a new meeting provider (implement `MeetingProvider`, export, add to `createDefaultProviders`, add tests — no core parser changes)  
16. Extending the Provider Registry  
17. Troubleshooting (no Join button → no link detected; companion always → native `canPresent` false; clipboard permissions)  
18. Future roadmap (prefs, more providers, native injection when APIs allow)

- [ ] **Step 2: Run package script**

```bash
npm run package
```

Expected: `dist/meeting-reminder-join-0.1.0.xpi` created.

- [ ] **Step 3: Final verification**

```bash
npm test && npm run typecheck && npm run build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add README.md package.json
git commit -m "docs: add developer README for Meeting Reminder Join"
```

---

## Manual Thunderbird smoke checklist (after Task 10–11)

Not automated — run once before calling the feature complete:

1. `npm run build`
2. Thunderbird 128+ → Load Temporary Add-on → `dist/extension/manifest.json`
3. Create a calendar event with Location `https://meet.google.com/abc-defg-hij`, reminder in 1 minute
4. When reminder fires, companion (or native) shows Join / Copy with Google Meet
5. Join opens the URL; Copy places URL on clipboard
6. Create event with no meeting URL → extension stays invisible
7. Event with Zoom + Meet in description → first wins; dropdown switches

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Eight providers + registry plugin architecture | Tasks 4–5 |
| Detect location/description/plain/HTML | Tasks 3, 6 |
| Join / Copy / multi-link primary+alternatives | Tasks 7–8, 10 |
| Hybrid native → companion fallback | Task 8, 10 |
| Companion meeting-only Native List Row | Tasks 9–10 |
| Never mutate calendar | Adapters read-only; README |
| Unit tests without Thunderbird | Tasks 2–8 |
| README all sections | Task 11 |
| Build + `.xpi` | Tasks 9, 11 |
| Hexagonal layers / composition root | Tasks 7–10 |

No TBD placeholders remain. Types are consistent: `MeetingLink`, `ReminderAction`, `MeetingDetectionResult`, port method names `open` / `writeText` / `canPresent` / `present` / `hide`.
