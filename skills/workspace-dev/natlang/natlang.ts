import iconIntent from "./iconIntent.nl";
import { resolveIcon, type IconCatalogFs } from "./catalog.js";
import type { IconChoice, UnitDescription } from "./types.js";

export { iconIntent };

/**
 * Choose a unit's identity icon: the small model decides what it should show,
 * and the shipped catalog (read through the caller's own `fs`) confirms the
 * name exists. The result is an authoring input for `setUnitIcon`,
 * `prepareUnitIcon`, or the scaffolders' `icon`.
 */
export async function unitIcon(unit: UnitDescription, fs: IconCatalogFs): Promise<IconChoice> {
  return resolveIcon(await iconIntent(unit), fs);
}
