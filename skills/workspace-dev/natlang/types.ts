/** A unit (panel, worker, app, extension, about page) that needs an identity icon. */
export type UnitDescription = {
  /** The unit's name. */
  name: string;
  /** What kind of unit it is: panel, worker, app, extension, or about. */
  kind: string;
  /** What the unit does, in a sentence. */
  description: string;
};

/**
 * What the unit's icon should show. `family` is "brand" for a technology the unit directly implements or integrates,
 * "lucide" for a concrete object or action that stands for a generic concept, "emoji" for a single emoji that says
 * more than a drawn icon would. `term` is the brand name (git), the Lucide icon name in lowercase words joined by
 * hyphens (messages-square), or the emoji itself.
 */
export type IconIntent = {
  family: "brand" | "lucide" | "emoji";
  term: string;
};

/** An icon the workspace-dev catalog accepts as an authoring input (`setUnitIcon`, `prepareUnitIcon`, `icon:` of the scaffolders). */
export type IconChoice = {
  family: "brand" | "lucide" | "emoji";
  /** "brand:git", "lucide:messages-square", or the emoji itself. */
  id: string;
};
