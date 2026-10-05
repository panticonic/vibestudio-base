# Icons

Use one restrained icon system across workspace UI and unit identity.

## Interface icons

- For React panels/apps/packages, import named Lucide components from
  `@workspace/ui/icons`, for example
  `import { GitBranch, FileText } from "@workspace/ui/icons"`.
- Imports are tree-shakeable. Import named components only; never import an
  all-icons object, sprite, font, or runtime icon loader.
- For the first-party mobile shell, import named components from
  `apps/mobile/src/design/icons`. That registry is the sole
  `lucide-react-native` package boundary: it uses literal per-icon exports so
  Metro includes only the icons the app renders. Add a missing icon there;
  never import the package barrel or a package subpath from a caller.
- Existing Radix icons may remain in established shell surfaces. Do not add
  Font Awesome, Iconify, React Icons, Heroicons, or another general catalog.
- Give icon-only controls an accessible name (`aria-label` on web,
  `accessibilityLabel` on React Native). Decorative icons must be hidden from
  assistive technology. Never rely on color alone to communicate state.

## Unit identity icons

Every user-visible or executable unit declares exactly one
`vibestudio.icon`. Choose in this order:

1. A truthful brand mark when the unit directly implements or integrates that
   named technology (for example Git, TypeScript, Claude, Svelte, or Gmail).
2. A concrete Lucide object/action for a generic concept (for example
   `file-text`, `database`, `messages-square`, or `shield-check`).
3. A single semantic emoji only when it is more expressive than a drawn icon.
4. Original repo-local artwork for a product identity.

### Authoring inputs and stored declarations

`vibestudio.icon` stores **one semantic emoji** or a **unit-relative image
path**, such as `"./assets/icon.svg"`. Image paths must stay inside the unit,
use canonical path segments, and end in SVG, PNG, JPEG, WebP, AVIF, GIF, or ICO.
Assets must exist and be at most 1 MiB. URLs, data URLs, labels, and catalog IDs
are invalid manifest declarations; build and installation validation reject them.

Catalog IDs such as `"lucide:columns-3"` and `"brand:git"` are **authoring
inputs**, accepted by `prepareProjects`, `prepareApplication`, `prepareUnitIcon`,
and `setUnitIcon`. Never copy a catalog ID into `package.json`.

For new panels and workers, pass the catalog ID as the scaffolder's `icon`
argument. For existing units of any executable kind, use `setUnitIcon`. The offline
catalog includes every SVG shipped by Lucide Static 1.27.0, including its
aliases. Use `searchProjectCatalog` when you need to discover a name:

```ts
import {
  prepareProjects,
  searchProjectCatalog,
} from "@workspace-skills/workspace-dev";

const catalog = await searchProjectCatalog({
  resource: "icon",
  query: "messages square",
  limit: 5,
});
const icon = catalog.entries[0]?.id;
if (!icon) throw new Error("The messages icon is unavailable");
return prepareProjects([
  {
    projectType: "panel",
    name: "inbox",
    icon,
    authority: scope.panelAuthority,
    authorityReason: scope.panelAuthorityReason,
  },
]);
```

The scaffold copies only the selected SVG into `assets/icon.svg`
and prepares it in the current context without publication. Author the complete
unit authority values before this invocation; see [PROJECTS.md](../PROJECTS.md).
It writes `vibestudio.icon: "./assets/icon.svg"`; no icon library enters the
unit's runtime bundle. Valid requests read only their selected SVG; catalog
search lists filenames on demand without loading artwork. Catalog search returns
12 entries by default (at most 500); `listProjectIcons()` returns all ids.
Newer upstream releases can contain names absent from the pinned catalog.
Invalid ids fail before mutation with suggestions in the message and bounded
catalog evidence in structured error data. Brand icons remain the selected
Simple Icons marks listed below.

### Change an existing unit

Use the same catalog for panels, workers, apps, extensions, and About pages:

```ts
import { setUnitIcon } from "@workspace-skills/workspace-dev";

scope.iconChange = await setUnitIcon({
  repoPath: "panels/inbox",
  icon: "lucide:messages-square",
});
```

This resolves the unit at the current working head and prepares its manifest
and selected artwork together in one semantic VCS edit. It preserves the rest
of the manifest, replaces `assets/icon.svg` when present, and returns a
`preparation` receipt with the new working head. A concurrent edit is a visible
conflict; inspect the current state before making another deliberate request.
Review, verify, commit, and publish the candidate through the ordinary workflow.
It does not publish or rebuild a live unit.

For an emoji, pass it directly. For custom artwork already in the unit, pass
its `./` path; the operation checks that file at the same working state and
its size before editing. It leaves previous artwork in place when switching
to an emoji or another path; remove unused source only when it is no longer
referenced elsewhere.

### Author a complete unit manually

Apps and extensions use their normal authoring workflows. To include a catalog
icon when preparing their files, call the same resolver:

```ts
import { prepareUnitIcon } from "@workspace-skills/workspace-dev";

const identity = await prepareUnitIcon("brand:git");
// Add identity.files to the unit's files and use identity.icon in its manifest.
// Write the complete candidate, including artwork, in one semantic VCS edit.
```

`prepareUnitIcon` returns `{ icon, files }` without mutation. Scaffolding and
`setUnitIcon` use this exact resolver; coloring, licenses, and catalog errors
are consistent across unit kinds. Custom paths and emoji pass through after
validation. Keep artwork square, simple, transparent, and legible at 16–20 px.

Do not use generated initials, hash colors, remote favicons, or remote SVG URLs.
Browser panels use the page's authentic captured favicon instead of a unit icon.

### Cross-client coverage

An identity change is incomplete until both first-party clients are audited:

| Concept           | Desktop shell    | Mobile shell         |
| ----------------- | ---------------- | -------------------- |
| Active panel      | title breadcrumb | AppBar title pill    |
| Panel collection  | tree/sidebar     | drawer tree          |
| Privileged caller | approval card    | approval sheet       |
| Unit installation | install review   | install review sheet |
| Browser identity  | captured favicon | captured favicon     |

Use the same canonical `icon`, source path, and browser-favicon projection in
both clients. Keep rendering native (`PanelIcon` on desktop,
`MobileUnitIcon`/`MobilePanelIcon` on mobile); do not add a second identity
field or a mobile-only resolver. On mobile, SVG artwork is rendered by
`react-native-svg`; React Native `Image` is only the raster path. Add focused
behavioral coverage for every affected row in this table.

## Unit ownership and provenance

Each unit owns its checked-in `vibestudio.icon` declaration and local artwork.
Change the unit's manifest and `assets/icon.svg` together; there is no central
host-owned assignment table. Run the workspace tests after changing unit
identity so the icon-coverage check verifies every executable unit and its
local asset. Units contain only their own small SVG.

- Semantic sources: Lucide Static 1.27.0, ISC license.
- Brand sources: Simple Icons 16.27.1. The collection is CC0, but individual
  marks remain subject to their owners' trademark and usage rules. Use brand
  marks only for accurate nominative identification, never as decoration or an
  implication of endorsement.
