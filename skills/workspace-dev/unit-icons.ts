import { fs } from "@workspace/runtime";
import { validateUnitIconDeclaration } from "@vibestudio/shared/unitManifest";

export type ProjectIconCatalog = string[];

/** Stored declaration and any artwork to write beside it in the same edit. */
export interface PreparedUnitIcon {
  icon: string | undefined;
  files: Record<string, string>;
}

export interface ProjectCatalogQuery {
  resource: "icon";
  query?: string;
  families?: Array<"lucide" | "brand">;
  limit?: number;
}

export interface ProjectCatalogEntry {
  resource: "icon";
  id: string;
  family: "lucide" | "brand";
  name: string;
}

export interface ProjectCatalogResult {
  protocol: "workspace-dev-catalog.v1";
  resource: "icon";
  query: string | null;
  total: number;
  entries: ProjectCatalogEntry[];
  truncated: number;
}

export interface ProjectIconFailureData {
  code: "project_icon_invalid";
  icon: string;
  kind: "lucide" | "brand";
  name: string;
  suggestions: string[];
  catalogQuery: ProjectCatalogQuery;
  catalog: ProjectCatalogResult;
  recovery: {
    action: "correct-request";
    instruction: string;
  };
}

export class ProjectIconError extends Error {
  readonly code = "project_icon_invalid";
  readonly errorData: ProjectIconFailureData;

  constructor(errorData: ProjectIconFailureData) {
    super(
      `Unknown ${errorData.kind} icon: ${errorData.name || "(empty)"}. ` +
        (errorData.suggestions.length
          ? `Try ${errorData.suggestions.join(", ")}. `
          : "") +
        `Call searchProjectCatalog(${JSON.stringify(errorData.catalogQuery)}) for the installed catalog, or omit icon.`,
    );
    this.name = "ProjectIconError";
    this.errorData = errorData;
  }
}

const BRAND_ICON_COLORS: Readonly<Record<string, string>> = {
  claude: "#D97757",
  git: "#F05032",
  gmail: "#EA4335",
  gnubash: "#4EAA25",
  javascript: "#F7DF1E",
  react: "#61DAFB",
  svelte: "#FF3E00",
  typescript: "#3178C6",
};

function catalogDirectory(kind: "lucide" | "brand"): string {
  return `skills/workspace-dev/assets/icons/${kind === "brand" ? "brands" : "lucide"}`;
}

async function catalogNames(kind: "lucide" | "brand"): Promise<string[]> {
  const entries = await fs.readdir(catalogDirectory(kind));
  const names = entries
    .filter((entry) => entry.endsWith(".svg"))
    .map((entry) => entry.slice(0, -4))
    .sort((left, right) => left.localeCompare(right));
  if (kind === "brand") {
    const metadata = Object.keys(BRAND_ICON_COLORS).sort((left, right) =>
      left.localeCompare(right),
    );
    if (
      names.length !== metadata.length ||
      names.some((name, index) => name !== metadata[index])
    ) {
      throw new Error(
        "The curated brand icon assets and color metadata disagree; repair the workspace-dev catalog",
      );
    }
  }
  return names;
}

/** Return the exact icon ids accepted by icon authoring. */
export async function listProjectIcons(): Promise<ProjectIconCatalog> {
  return (await projectCatalogEntries())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => entry.id);
}

/** Bounded discovery for icons accepted by scaffolding and setUnitIcon. */
export async function searchProjectCatalog(
  query: ProjectCatalogQuery,
): Promise<ProjectCatalogResult> {
  return filterProjectCatalog(
    await projectCatalogEntries(query.families),
    query.query,
    query.limit,
  );
}

async function projectCatalogEntries(
  requestedFamilies?: Array<"lucide" | "brand">,
): Promise<ProjectCatalogEntry[]> {
  const families: Array<"lucide" | "brand"> = requestedFamilies?.length
    ? [...new Set(requestedFamilies)]
    : ["lucide", "brand"];
  return (
    await Promise.all(
      families.map(async (family) =>
        catalogEntries(family, await catalogNames(family)),
      ),
    )
  ).flat();
}

function catalogEntries(
  family: "lucide" | "brand",
  names: string[],
): ProjectCatalogEntry[] {
  return names.map((name) => ({
    resource: "icon",
    id: `${family}:${name}`,
    family,
    name,
  }));
}

function filterProjectCatalog(
  entries: ProjectCatalogEntry[],
  query: string | undefined,
  requestedLimit: number | undefined,
): ProjectCatalogResult {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const searchName = normalizedQuery
    .replace(/^(lucide|brand):/u, "")
    .replace(/\s+/gu, "-");
  const limit = Math.max(1, Math.min(requestedLimit ?? 12, 500));
  const ranked = entries
    .map((entry) => ({
      entry,
      score: normalizedQuery
        ? entry.id === normalizedQuery || entry.name === searchName
          ? -1_000
          : entry.name.includes(searchName)
            ? -500 + Math.abs(entry.name.length - searchName.length)
            : editDistance(searchName, entry.name)
        : 0,
    }))
    .sort(
      (left, right) =>
        left.score - right.score || left.entry.id.localeCompare(right.entry.id),
    );
  const selected = ranked.slice(0, limit).map(({ entry }) => entry);
  return {
    protocol: "workspace-dev-catalog.v1",
    resource: "icon",
    query: normalizedQuery || null,
    total: entries.length,
    entries: selected,
    truncated: Math.max(0, entries.length - selected.length),
  };
}

function editDistance(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function invalidProjectIcon(
  icon: string,
  kind: "lucide" | "brand",
  name: string,
  available: string[],
): ProjectIconError {
  const catalogQuery: ProjectCatalogQuery = {
    resource: "icon",
    query: name,
    families: [kind],
    limit: 12,
  };
  const catalog = filterProjectCatalog(
    catalogEntries(kind, available),
    name,
    catalogQuery.limit,
  );
  const suggestions = catalog.entries.slice(0, 5).map((entry) => entry.id);
  return new ProjectIconError({
    code: "project_icon_invalid",
    icon,
    kind,
    name,
    suggestions,
    catalogQuery,
    catalog,
    recovery: {
      action: "correct-request",
      instruction:
        "Pass one exact id from errorData.catalog.entries, call searchProjectCatalog(errorData.catalogQuery), or omit icon.",
    },
  });
}

export async function prepareUnitIcon(
  icon: string | undefined,
): Promise<PreparedUnitIcon> {
  const files: Record<string, string> = {};
  const declaredKind = /^(lucide|brand):/u.exec(icon ?? "")?.[1] as
    | "lucide"
    | "brand"
    | undefined;
  if (!declaredKind) {
    validateUnitIconDeclaration(icon);
    return { icon, files };
  }
  const match = /^(lucide|brand):([a-z0-9-]+)$/u.exec(icon ?? "");
  const kind = declaredKind;
  const name = match?.[2] ?? "";
  const source = `${catalogDirectory(kind)}/${name}.svg`;
  // Valid requests touch only their selected asset, regardless of catalog size.
  if (!match || !(await fs.exists(source))) {
    throw invalidProjectIcon(icon!, kind, name, await catalogNames(kind));
  }
  const brandColor = BRAND_ICON_COLORS[name];
  if (kind === "brand" && !brandColor)
    throw new Error(`Missing brand color metadata: ${name}`);
  let svg = (await fs.readFile(source, "utf-8")) as string;
  svg =
    kind === "brand"
      ? `<!-- Source: Simple Icons 16.27.1 (CC0 collection); brand rights remain with their owners. -->\n${svg.replace("<svg ", `<svg fill="${brandColor}" `)}`
      : svg.replaceAll("currentColor", "#268CA3");
  files["assets/icon.svg"] = svg;
  return { icon: "./assets/icon.svg", files };
}
