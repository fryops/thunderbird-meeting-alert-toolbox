import type { ReminderAction } from "../../application/resolve-reminder-action.js";
import type { ReminderPresenter } from "../../ports/reminder-presenter.js";

type WindowsCreateOptions = {
  url: string;
  type: "popup";
  width: number;
  height: number;
};

type ThunderbirdCompanionApi = {
  runtime?: {
    getURL?: (path: string) => string;
  };
  windows?: {
    create?: (options: WindowsCreateOptions) => Promise<unknown>;
    remove?: (windowId: number) => Promise<void>;
  };
};

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

    const companionUrl = new URL(getURL("companion/companion.html"));
    companionUrl.searchParams.set("payload", JSON.stringify(serializeAction(action)));

    if (this.companionWindowId !== undefined) {
      try {
        await removeWindow(this.companionWindowId);
      } catch (error) {
        console.warn("Unable to close previous companion window", error);
      }
      this.companionWindowId = undefined;
    }

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
    if (!removeWindow || this.companionWindowId === undefined) return;

    await removeWindow(this.companionWindowId);
    this.companionWindowId = undefined;
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
