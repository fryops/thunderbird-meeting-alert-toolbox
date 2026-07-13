# Meeting Reminder Join — Design Spec

**Date:** 2026-07-10  
**Status:** Approved for implementation planning  
**Product:** Thunderbird Meeting Toolkit — Join Meeting from reminders

## Overview

A Thunderbird MailExtension that does **not** create meetings and does **not** modify calendar invitations. When an upcoming calendar reminder fires, the extension inspects the event’s Location and Description/Body for recognized online meeting links. If a supported link is found, it surfaces a prominent **Join Meeting** action (plus **Copy Link** and optional multi-link selection). If no meeting link exists, the extension remains invisible.

## Goals

- Detect common online meeting providers from calendar event fields
- Surface Join / Copy from the reminder experience
- Plugin-style provider architecture (add providers without changing core logic)
- Clean / Hexagonal Architecture isolating domain from Thunderbird APIs
- High unit-test coverage of domain and application layers without launching Thunderbird

## Non-goals

- Creating, editing, or deleting calendar events or invitations
- Acting as a full calendar client
- Supporting every possible meeting vendor in v1 (extensibility is required; eight providers ship first)

## Decisions (validated)

| Topic | Choice |
| --- | --- |
| Reminder UI | **C — Native List Row** (list row with provider chip, Join / Copy / Dismiss) |
| Integration | **Hybrid** — enhance native reminders when possible; companion window as fallback |
| Companion trigger | **Only as fallback** when native reminder UI cannot be extended |
| Companion list contents | **Meeting-link reminders only** |
| Architecture approach | **Hexagonal MailExtension** with TypeScript domain/application core |

## Supported providers (v1)

| Provider | Example patterns |
| --- | --- |
| Zoom | `https://zoom.us/j/...`, `https://*.zoom.us/j/...`, `zoommtg://...` |
| Microsoft Teams | `https://teams.microsoft.com/...`, `https://*.teams.microsoft.com/...` |
| Google Meet | `https://meet.google.com/...` |
| Cisco Webex | `https://*.webex.com/...` |
| GoTo Meeting | `https://meet.goto.com/...` |
| Slack | `https://app.slack.com/...`, Slack Huddle links where available |
| Discord | `https://discord.gg/...`, channel invite / voice meeting links where applicable |
| Jitsi Meet | `https://meet.jit.si/...` |

Future providers (register-only): Amazon Chime, RingCentral, BlueJeans, Skype, Whereby, BigBlueButton, Daily.co, custom enterprise systems.

## Architecture

### Layers

```
Composition Root
  → Adapters (Thunderbird Calendar, Native/Companion Reminder Presenters,
              Browser Launcher, Clipboard)
  → Ports (CalendarRepository, ReminderPresenter, BrowserLauncher, ClipboardService)
  → Application (DetectMeetingLink, ResolveReminderAction, JoinMeeting, CopyMeetingLink)
  → Domain (MeetingLink, MeetingProvider, MeetingProviderRegistry,
            MeetingDetectionResult, value objects, provider plugins)
```

### Rules

1. Business logic **never** imports Thunderbird / `browser.*` APIs.
2. The parser **never** hardcodes provider-specific logic; it uses `MeetingProviderRegistry`.
3. Adding a provider requires only a new detector module + registration in the composition root (or provider index).
4. The extension **never** mutates calendar events.

### Domain

- **MeetingProvider** — `id`, `displayName`, `icon`, `detectionPatterns`, `validate(url)`, `normalize(url)`
- **MeetingProviderRegistry** — owns all providers; resolve by id; match URL against registered providers
- **MeetingLink** — normalized URL + provider id + optional display metadata
- **MeetingDetectionResult** — ordered list of detections; `primary` = first valid; `alternatives` = rest
- **Value objects** — e.g. `EventTextCorpus` (aggregated searchable text from location/description/bodies)

### Application use cases

- **DetectMeetingLink** — given event fields, return `MeetingDetectionResult`
- **ResolveReminderAction** — map detection + event metadata to a presentable reminder action (title, when, primary link, alternatives)
- **JoinMeeting** — open primary (or selected) URL via `BrowserLauncher`
- **CopyMeetingLink** — write URL via `ClipboardService`

### Ports

| Port | Responsibility |
| --- | --- |
| `CalendarRepository` | Load event by id / reminder payload; read-only |
| `ReminderPresenter` | Present Join UI or no-op when invisible |
| `BrowserLauncher` | Open URL in external/default browser |
| `ClipboardService` | Write text to clipboard |

### Adapters

- **ThunderbirdCalendarRepository** — maps TB calendar event APIs to domain event fields (location, description, plain/HTML body)
- **NativeReminderPresenter** — attempts to enhance Thunderbird’s native reminder UI when APIs allow
- **CompanionReminderPresenter** — Native List Row companion window; **meeting-link reminders only**; used when native enhancement is unsupported
- **HybridReminderPresenter** — tries native first; falls back to companion
- **ThunderbirdBrowserLauncher** / **ThunderbirdClipboardService** — thin TB wrappers

### Composition root

Wires registry (all v1 providers), use cases, and adapters. Extension background/entry scripts only talk to the composition root.

## Data flow

1. Reminder fires (Thunderbird calendar).
2. `CalendarRepository` loads the event.
3. `DetectMeetingLink` builds a text corpus from location, description, plain body, and HTML body; strips HTML; normalizes whitespace; matches URLs via `MeetingProviderRegistry`.
4. If no valid links → remain invisible.
5. If links exist → `ResolveReminderAction` (primary = first valid; alternatives = remaining).
6. `HybridReminderPresenter` tries native enhancement; if unsupported → companion Native List Row.
7. User actions:
   - **Join Meeting** → `JoinMeeting` → `BrowserLauncher.open(url)`
   - **Copy** → `CopyMeetingLink` → `ClipboardService.write(url)`
   - **Provider dropdown** (when multiple) → switch primary; Join/Copy use selected URL
   - **Dismiss** → close/hide presenter UI only (no calendar mutation)

## Reminder UI (Native List Row)

```
┌─────────────────────────────────────┐
│ Calendar Reminders                  │
├─────────────────────────────────────┤
│ Sprint Planning            in 5 min │
│ Today · 2:00–2:30 PM                │
│ ┌─────────────────────────────────┐ │
│ │ G  Google Meet        ▾ 2 links │ │
│ └─────────────────────────────────┘ │
│ [ Join Meeting ]  [ Copy ] [Dismiss]│
└─────────────────────────────────────┘
```

- Show provider name and icon when practical (color/letter fallback if assets unavailable).
- Multiple links: default first valid; dropdown/secondary menu for alternatives.
- Companion list includes **only** reminders that have a detected meeting link.

## Detection behavior

- Search: Location, Description, plain text body, HTML body (when available).
- Tolerate HTML markup, formatting changes, and whitespace.
- Ignore unrelated URLs and malformed URLs (skip, do not throw).
- Return first valid provider as primary while exposing all detections.
- Provider `validate` / `normalize` run after pattern match.

## Error handling

| Condition | Behavior |
| --- | --- |
| Malformed / unknown URLs | Ignored |
| No meeting link | No UI |
| Native presenter unsupported | Companion fallback |
| Browser launch failure | Short non-blocking error; Copy remains available |
| Clipboard failure | Brief failure indication; Join remains available |
| Event load failure | Log; stay silent so Thunderbird’s own reminder is not blocked |
| Multiple links with some invalid | Filter invalid; primary = first remaining valid |

## Testing

- **Runner:** Vitest
- **Scope:** Domain + application with fake port adapters
- **Required cases:** Zoom, Teams, Google Meet, Webex, GoTo, Slack, Discord, Jitsi; HTML parsing; plain text parsing; multiple links; invalid links; unknown providers; mixed providers; Copy; Join; registry resolution
- **Manual:** README smoke test — temporary add-on install, reminder with Meet/Zoom link, verify Join/Copy and invisible path

## Stack & packaging

- TypeScript MailExtension
- Manifest V3 where supported by target Thunderbird
- Target: Thunderbird **128+ ESR** APIs
- Build: `tsc` and/or esbuild → loadable extension directory
- Package script producing `.xpi`
- Unit tests runnable without Thunderbird

## Folder structure (planned)

```
src/
  domain/
    meeting-link.ts
    meeting-provider.ts
    meeting-provider-registry.ts
    meeting-detection-result.ts
    providers/          # one module per provider
  application/
    detect-meeting-link.ts
    resolve-reminder-action.ts
    join-meeting.ts
    copy-meeting-link.ts
  ports/
    calendar-repository.ts
    reminder-presenter.ts
    browser-launcher.ts
    clipboard-service.ts
  adapters/
    thunderbird/
      calendar-repository.ts
      hybrid-reminder-presenter.ts
      native-reminder-presenter.ts
      companion-reminder-presenter.ts
      browser-launcher.ts
      clipboard-service.ts
  composition/
    root.ts
  extension/            # background, companion UI, manifest assets
tests/
  domain/
  application/
  providers/
docs/
  superpowers/specs/
```

## Documentation deliverables (implementation)

README must cover: overview, features, providers, architecture diagrams, Clean + Hexagonal explanation, folder walkthrough, Thunderbird setup, local development, build, temporary install, packaging, tests, debugging, adding a provider, extending the registry, troubleshooting, roadmap.

## Out of scope for v1 (roadmap)

- Preferences UI (e.g. force companion always)
- Additional providers beyond the eight listed
- Deep XUL/experiment patching of Thunderbird’s reminder dialog beyond supported WebExtension APIs
- Syncing or storing meeting history

## Success criteria

1. Reminder with a supported link shows Join + Copy with correct provider.
2. Reminder without a link shows no extension UI.
3. Multiple links: first is default; user can select another.
4. New provider can be added by implementing + registering a detector only.
5. Domain/application unit tests pass without Thunderbird.
6. Extension never writes to calendar events.
