import type { IconChoice, IconIntent } from "./types.js";

/** The icon catalog the workspace-dev skill ships; the same directories `prepareUnitIcon` reads. */
const CATALOG_ROOT = "skills/workspace-dev/assets/icons";
const DIRECTORIES = { brand: "brands", lucide: "lucide" } as const;

/** The part of the `fs` service icon lookup reads. */
export interface IconCatalogFs {
  readdir(path: string): Promise<string[]>;
}

/** The intent names an icon that is not in the catalog. The message lists the nearest catalog names to choose from. */
export class IconNotInCatalog extends Error {
  override readonly name = "IconNotInCatalog";
}

async function catalogNames(fs: IconCatalogFs, family: "brand" | "lucide"): Promise<string[]> {
  const entries = await fs.readdir(`${CATALOG_ROOT}/${DIRECTORIES[family]}`);
  return entries.filter((entry) => entry.endsWith(".svg")).map((entry) => entry.slice(0, -4));
}

const words = (term: string): string[] =>
  term
    .toLowerCase()
    .replace(/^(?:lucide|brand):/u, "")
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length > 0);

/** A single emoji (one grapheme with a pictographic code point), as `vibestudio.icon` accepts. */
function isSingleEmoji(term: string): boolean {
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(term)];
  return graphemes.length === 1 && /\p{Extended_Pictographic}/u.test(term);
}

/**
 * Check an intent against the catalog and return the id the authoring inputs
 * take. A name is accepted when its words match a catalog name exactly; a
 * near-miss is refused with the catalog names that contain its words, so the
 * next attempt picks a real one instead of a guessed spelling.
 */
export async function resolveIcon(intent: IconIntent, fs: IconCatalogFs): Promise<IconChoice> {
  if (intent.family === "emoji") {
    if (!isSingleEmoji(intent.term)) {
      throw new IconNotInCatalog(`"${intent.term}" is not a single emoji. Use exactly one emoji, or a Lucide or brand icon.`);
    }
    return { family: "emoji", id: intent.term };
  }
  const names = await catalogNames(fs, intent.family);
  const wanted = words(intent.term).join("-");
  if (names.includes(wanted)) return { family: intent.family, id: `${intent.family}:${wanted}` };
  const near = names.filter((name) => words(intent.term).some((word) => word.length > 2 && name.split("-").includes(word)));
  const available = intent.family === "brand" ? names : near.slice(0, 8);
  throw new IconNotInCatalog(
    `${intent.family} icon "${intent.term}" is not in the catalog.` +
      (available.length > 0
        ? ` Choose one of: ${available.join(", ")}.`
        : intent.family === "lucide"
          ? " No Lucide name shares a word with it; name a more common object or action."
          : "")
  );
}
