interface MeetingLinkPayload {
  providerId: string;
  displayName: string;
  url: string;
  icon?: string;
}

interface ReminderActionPayload {
  eventId: string;
  title: string;
  start: string;
  end?: string;
  primary: MeetingLinkPayload;
  alternatives?: readonly MeetingLinkPayload[];
}

type CompanionRuntimeApi = {
  runtime?: {
    sendMessage?: (message: RuntimeMessage) => Promise<{ ok?: boolean } | undefined>;
  };
};

type RuntimeMessage =
  | { type: "join-meeting"; url: string }
  | { type: "copy-meeting-link"; url: string };

declare const browser: CompanionRuntimeApi | undefined;
declare const messenger: CompanionRuntimeApi | undefined;

const providerFallbackIcon: Record<string, string> = {
  "google-meet": "G",
  zoom: "Z",
  teams: "T",
  webex: "W",
  goto: "Go",
  slack: "S",
  discord: "D",
  jitsi: "J",
};

const reminderRow = getElement<HTMLElement>(".reminder-row");
const title = getElement<HTMLElement>("#reminder-title");
const time = getElement<HTMLElement>("#reminder-time");
const relative = getElement<HTMLElement>("#reminder-relative");
const providerChip = getElement<HTMLElement>("#provider-chip");
const providerIcon = getElement<HTMLElement>("#provider-icon");
const providerName = getElement<HTMLElement>("#provider-name");
const providerSelect = getElement<HTMLSelectElement>("#provider-select");
const joinButton = getElement<HTMLButtonElement>("#join-button");
const copyButton = getElement<HTMLButtonElement>("#copy-button");
const dismissButton = getElement<HTMLButtonElement>("#dismiss-button");

let selectedLink = linkFromOption(providerSelect.selectedOptions[0]);
const runtime = typeof messenger !== "undefined" ? messenger.runtime : browser?.runtime;

const payload = readPayloadFromLocation();
if (payload) {
  hydrateReminder(payload);
} else {
  reminderRow.hidden = true;
}

providerSelect.addEventListener("change", () => {
  selectedLink = linkFromOption(providerSelect.selectedOptions[0]);
  if (selectedLink) {
    renderProvider(selectedLink);
  }
});

joinButton.addEventListener("click", () => {
  void sendSelectedLinkAction("join-meeting", joinButton, "Join Meeting");
});

copyButton.addEventListener("click", () => {
  void sendSelectedLinkAction("copy-meeting-link", copyButton, "Copy");
});

dismissButton.addEventListener("click", () => {
  reminderRow.hidden = true;
  window.close();
});

function hydrateReminder(action: ReminderActionPayload): void {
  const links = [action.primary, ...(action.alternatives ?? [])].filter(isUsableLink);
  const firstLink = links[0];
  if (!firstLink) return;

  title.textContent = action.title;
  time.textContent = formatDateRange(action.start, action.end);
  relative.textContent = formatRelative(action.start);
  renderOptions(links);
  selectedLink = firstLink;
  renderProvider(selectedLink);
  reminderRow.hidden = false;
}

function renderOptions(links: readonly MeetingLinkPayload[]): void {
  providerSelect.replaceChildren(
    ...links.map((link) => {
      const option = document.createElement("option");
      option.value = link.url;
      option.textContent = link.displayName;
      option.dataset.providerId = link.providerId;
      option.dataset.icon = link.icon ?? "";
      return option;
    }),
  );
  providerSelect.hidden = links.length <= 1;
  providerSelect.disabled = links.length <= 1;
}

function renderProvider(link: MeetingLinkPayload): void {
  providerChip.dataset.providerId = link.providerId;
  reminderRow.dataset.providerId = link.providerId;
  providerIcon.className = "provider-chip__icon";
  providerIcon.classList.add(`provider-chip__icon--${sanitizeProviderId(link.providerId)}`);
  // Provider `icon` is an id (e.g. "zoom"), not a glyph. Prefer letter marks.
  providerIcon.textContent = glyphForProvider(link.providerId, link.displayName);
  providerName.textContent = link.displayName;
}

function linkFromOption(option: HTMLOptionElement | undefined): MeetingLinkPayload | null {
  if (!option) return null;

  const providerId = option.dataset.providerId ?? providerChip.dataset.providerId ?? "unknown";
  return {
    providerId,
    displayName: option.textContent?.trim() || providerName.textContent?.trim() || "Meeting",
    url: option.value,
    icon: providerId,
  };
}

function glyphForProvider(providerId: string, displayName: string): string {
  return (
    providerFallbackIcon[providerId] ??
    displayName.trim().charAt(0).toUpperCase() ??
    "?"
  );
}

async function sendSelectedLinkAction(
  type: RuntimeMessage["type"],
  button: HTMLButtonElement,
  idleLabel: string,
): Promise<void> {
  if (!selectedLink || !runtime?.sendMessage) return;

  button.disabled = true;
  button.textContent = type === "copy-meeting-link" ? "Copying..." : "Opening...";
  try {
    const response = await runtime.sendMessage({ type, url: selectedLink.url });
    button.textContent = response?.ok === false ? "Failed" : type === "copy-meeting-link" ? "Copied" : "Opened";
  } catch {
    button.textContent = "Failed";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = idleLabel;
    }, 1200);
  }
}

function readPayloadFromLocation(): ReminderActionPayload | null {
  const currentUrl = new URL(window.location.href);
  const queryPayload = currentUrl.searchParams.get("payload");
  if (queryPayload) return parsePayload(queryPayload);

  const hash = currentUrl.hash.replace(/^#/, "");
  if (!hash) return null;

  const hashPayload = new URLSearchParams(hash).get("payload");
  if (hashPayload) return parsePayload(hashPayload);

  return parsePayload(hash);
}

function parsePayload(rawPayload: string): ReminderActionPayload | null {
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    return isReminderActionPayload(parsed) ? parsed : null;
  } catch {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(rawPayload));
      return isReminderActionPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function isReminderActionPayload(value: unknown): value is ReminderActionPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.eventId === "string" &&
    typeof value.title === "string" &&
    typeof value.start === "string" &&
    isUsableLink(value.primary) &&
    (value.end === undefined || typeof value.end === "string") &&
    (value.alternatives === undefined ||
      (Array.isArray(value.alternatives) && value.alternatives.every(isUsableLink)))
  );
}

function isUsableLink(value: unknown): value is MeetingLinkPayload {
  if (!isRecord(value)) return false;
  if (
    typeof value.providerId !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.url !== "string"
  ) {
    return false;
  }

  try {
    const url = new URL(value.url);
    return ["https:", "http:", "zoommtg:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeProviderId(providerId: string): string {
  return providerId.replace(/[^a-z0-9-]/gi, "");
}

function formatDateRange(startValue: string, endValue: string | undefined): string {
  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : null;
  if (Number.isNaN(start.getTime())) return "Upcoming";

  const day = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (!end || Number.isNaN(end.getTime())) {
    return `${day} · ${timeFormatter.format(start)}`;
  }

  return `${day} · ${timeFormatter.format(start)}-${timeFormatter.format(end)}`;
}

function formatRelative(startValue: string): string {
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return "soon";

  const minutes = Math.round((start.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes === 1) return "in 1 min";
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(minutes / 60);
  return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
}

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing companion element: ${selector}`);
  }

  return element;
}
