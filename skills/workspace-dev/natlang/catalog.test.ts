import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IconNotInCatalog, resolveIcon, type IconCatalogFs } from "./catalog.js";

/** The shipped catalog, listed from the skill's own assets the way the eval `fs` lists it. */
const catalog: IconCatalogFs = {
  async readdir(path: string): Promise<string[]> {
    const directory = path.replace("skills/workspace-dev/assets/icons/", "");
    return fs.readdirSync(fileURLToPath(new URL(`../assets/icons/${directory}`, import.meta.url)));
  },
};

describe("resolveIcon", () => {
  it("accepts an exact catalog name and returns the authoring id", async () => {
    await expect(resolveIcon({ family: "brand", term: "git" }, catalog)).resolves.toEqual({ family: "brand", id: "brand:git" });
    await expect(resolveIcon({ family: "lucide", term: "messages-square" }, catalog)).resolves.toEqual({
      family: "lucide",
      id: "lucide:messages-square",
    });
  });

  it("normalizes spelling the catalog normalizes", async () => {
    await expect(resolveIcon({ family: "lucide", term: "Messages Square" }, catalog)).resolves.toMatchObject({ id: "lucide:messages-square" });
    await expect(resolveIcon({ family: "lucide", term: "lucide:database" }, catalog)).resolves.toMatchObject({ id: "lucide:database" });
  });

  it("refuses a guessed name and lists real names that share a word", async () => {
    const error = await resolveIcon({ family: "lucide", term: "chat-bubbles" }, catalog).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IconNotInCatalog);
    expect((error as Error).message).toContain("Choose one of:");
  });

  it("lists every brand mark when a brand is not shipped", async () => {
    const error = await resolveIcon({ family: "brand", term: "figma" }, catalog).catch((caught: unknown) => caught);
    expect((error as Error).message).toContain("gmail");
    expect((error as Error).message).toContain("typescript");
  });

  it("accepts one emoji and refuses anything else", async () => {
    await expect(resolveIcon({ family: "emoji", term: "🎉" }, catalog)).resolves.toEqual({ family: "emoji", id: "🎉" });
    await expect(resolveIcon({ family: "emoji", term: "party" }, catalog)).rejects.toThrow(/not a single emoji/u);
    await expect(resolveIcon({ family: "emoji", term: "🎉🎉" }, catalog)).rejects.toThrow(/not a single emoji/u);
  });
});
