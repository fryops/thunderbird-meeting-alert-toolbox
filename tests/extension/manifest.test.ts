import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension manifest", () => {
  it("uses Thunderbird MV3 event-page background scripts", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "src", "extension", "manifest.json"), "utf8"),
    ) as {
      background?: unknown;
      experiment_apis?: { calendar_items?: unknown };
    };

    expect(manifest.background).toEqual({
      scripts: ["background.js"],
      type: "module",
    });
    expect(manifest.experiment_apis?.calendar_items).toBeTruthy();
  });
});
