import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

type WindowsCreateOptions = {
  url: string;
  type: "popup";
  width: number;
  height: number;
};

type WindowInfo = {
  id?: number;
  tabs?: Array<{ url?: string }>;
};

type ThunderbirdCompanionApi = {
  runtime?: {
    getURL?: (path: string) => string;
  };
  windows?: {
    create?: (options: WindowsCreateOptions) => Promise<unknown>;
    remove?: (windowId: number) => Promise<void>;
    getAll?: (options?: {
      populate?: boolean;
      windowTypes?: Array<"normal" | "popup" | "panel" | "app" | "devtools">;
    }) => Promise<WindowInfo[]>;
  };
};

const COMPANION_PATH_MARKER = "companion/companion.html";

export class CompanionReminderPresenter implements ReminderPresenter {
  private companionWindowId: number | undefined;

  constructor(private readonly thunderbird: ThunderbirdCompanionApi) {}

  async canPresent(): Promise<boolean> {
    return Boolean(
      this.thunderbird.runtime?.getURL &&
        this.thunderbird.windows?.create &&
        this.thunderbird.windows?.remove,
    );
  }

  async present(action: ReminderAction): Promise<void> {
    const getURL = this.thunderbird.runtime?.getURL;
    const createWindow = this.thunderbird.windows?.create;
    const removeWindow = this.thunderbird.windows?.remove;
    if (!getURL || !createWindow || !removeWindow) {
      throw new Error(
        "Companion window APIs are unavailable (missing windows permission or API)",
      );
    }

    await this.closeExistingCompanions(removeWindow);

    const companionUrl = new URL(getURL("companion/companion.html"));
    companionUrl.searchParams.set("payload", JSON.stringify(serializeAction(action)));

    try {
      const created = await createWindow({
        url: companionUrl.toString(),
        type: "popup",
        width: 420,
        height: action.alternatives.length > 0 ? 310 : 280,
      });
      this.companionWindowId = getWindowId(created);
      console.info("Opened companion reminder window", {
        windowId: this.companionWindowId,
        title: action.title,
      });
    } catch (error) {
      console.error("Failed to open companion reminder window", error);
      throw error;
    }
  }

  async hide(): Promise<void> {
    const removeWindow = this.thunderbird.windows?.remove;
    if (!removeWindow) return;
    await this.closeExistingCompanions(removeWindow);
  }

  private async closeExistingCompanions(
    removeWindow: (windowId: number) => Promise<void>,
  ): Promise<void> {
    const tracked = this.companionWindowId;
    this.companionWindowId = undefined;

    const ids = new Set<number>();
    if (tracked !== undefined) ids.add(tracked);

    const getAll = this.thunderbird.windows?.getAll;
    if (getAll) {
      try {
        const windows = await getAll({ populate: true, windowTypes: ["popup"] });
        for (const window of windows) {
          if (typeof window.id !== "number") continue;
          const isCompanion = window.tabs?.some((tab) =>
            typeof tab.url === "string" && tab.url.includes(COMPANION_PATH_MARKER),
          );
          if (isCompanion) ids.add(window.id);
        }
      } catch (error) {
        console.warn("Unable to enumerate companion windows", error);
      }
    }

    for (const windowId of ids) {
      try {
        await removeWindow(windowId);
      } catch (error) {
        console.warn("Unable to close companion window", { windowId, error });
      }
    }
  }
}

function serializeAction(action: ReminderAction) {
  return {
    ...action,
    start: action.start.toISOString(),
    end: action.end?.toISOString(),
  };
}

function getWindowId(value: unknown): number | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number"
  ) {
    return value.id;
  }

  return undefined;
}
