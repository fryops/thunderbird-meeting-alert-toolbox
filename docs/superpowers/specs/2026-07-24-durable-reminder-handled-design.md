# Durable Reminder Handled State — Design Spec

**Date:** 2026-07-24  
**Status:** Approved for implementation planning  
**Product:** Thunderbird Meeting Toolkit — prevent mid-meeting re-present of companion reminders

## Overview

Meeting reminders can reappear after the user has already seen them—especially mid-meeting—because “already shown” state lives only in memory and is lost when the MV3 background restarts. Dismiss currently only closes the companion window and does not record intent. Separately, hibernation catch-up must still show a reminder once when the user never saw one.

This change makes “handled” durable across background restarts for each meeting occurrence, while preserving one late catch-up for never-shown meetings.

## Goals

- Show the companion **at most once** per meeting occurrence (`primary URL + start`)
- Survive MV3 background sleep/restart without re-presenting a handled meeting
- Preserve hibernation catch-up: if never handled, still present once even after the meeting has started
- Keep domain/application free of direct `browser.*` usage (hexagonal ports)

## Non-goals

- Changing reminder lead-time / VALARM parsing
- Persisting handled state across Thunderbird quit/relaunch (session storage is enough)
- Skipping never-handled late catch-up when the meeting has already started
- UI changes to the companion

## Decisions (validated)

| Topic | Choice |
| --- | --- |
| Product rule | **Hybrid** — durable handled record; late catch-up only if never handled |
| Late catch-up after start | **Allowed once** if never handled |
| What marks handled | **Successful present** (dismiss/close/ignore do not matter for re-show) |
| Storage | `browser.storage.session` with in-memory fallback |
| Key | `primary.url + "\0" + start.toISOString()` (same as current debounce key) |
| TTL / prune | Keep until meeting end + 2 hours grace (if no end, start + 2 hours); prune on access |
| Existing debounce | Replace in-memory 45-minute debounce with durable handled check |

## Related context

- Hibernation catch-up lookback (`CATCHUP_LOOKBACK_MS = 30m` in `ReminderWatcher`) remains; it only surfaces candidates. `HandleReminder` decides whether to present.
- Fallback ICS alarms may fire both at start−15m and at start; without durable handled state, the second fire can reopen the companion during the meeting after a background restart.

## Architecture

### New port

`ReminderPresentationStore`

- `isHandled(key: string): Promise<boolean>`
- `markHandled(key: string, meta: { start: Date; end?: Date }): Promise<void>`
- Optional internal prune of expired entries

### Adapter

`SessionReminderPresentationStore`

- Backed by `browser.storage.session` (Thunderbird / WebExtension session storage)
- If session storage is unavailable, fall back to an in-memory `Map` (same process lifetime as today)
- Stored value shape: `{ handledAt: number; expiresAt: number }` keyed under a single namespace object (e.g. `reminderHandled`)

### Application

`HandleReminder.executeFromEvent`:

1. Resolve action (unchanged meeting-link detection).
2. Build key from `action.primary.url` + `action.start`.
3. If `store.isHandled(key)` → suppress native alarm if needed; **do not** present; return.
4. If in-flight for same key → return (race guard, unchanged).
5. `presenter.present(action)`.
6. On success → `store.markHandled(key, { start, end })`, then suppress native.
7. Remove the in-memory `recentlyPresented` / `DEFAULT_DEBOUNCE_MS` path (replaced by the store).

### Composition

Wire `SessionReminderPresentationStore` in `createApp` / root and inject into `HandleReminder`.

## Data flow

```
onAlarm / ReminderWatcher.poll
  → HandleReminder.executeFromEvent
      → detect + resolve action
      → ReminderPresentationStore.isHandled?
           yes → suppress native, skip present
           no  → present → markHandled → suppress native
```

## Error handling

- Storage read/write failures: log a warning; fall back to in-memory for that session so the add-on still runs.
- Present failure: **do not** mark handled (so a true failure can retry).
- Missing `storage.session`: use in-memory fallback only.

## Testing

Unit tests (fake store):

1. First present marks handled; second `executeFromEvent` for same URL+start is skipped.
2. Fresh `HandleReminder` instance sharing the same store still skips (simulates background restart with intact session storage).
3. Never-handled event still presents after meeting start (late catch-up).
4. Different start times for the same URL are independent occurrences.
5. Present throw → not marked handled → retry can present.

## Out of scope follow-ups

- Explicit “dismiss forever” vs “snooze” UX
- Persisting across full Thunderbird restarts via `storage.local`
- Skipping present solely because `now >= start` without a handled record
