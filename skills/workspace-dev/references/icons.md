# Icons

Use a single, restrained icon system for workspace UI and unit identity.

## Interface icons

- In React panels, apps, and packages, import named Lucide components from
  `@workspace/ui/icons`, for example
  `import { GitBranch, FileText } from "@workspace/ui/icons"`.
- Imports are tree-shakeable. Import named components only; never import an
  object of all icons, a sprite, an icon font, or a runtime icon loader.
- In the first-party mobile shell, import named components from
  `apps/mobile/src/design/icons`. That registry is the only module that imports
  `lucide-react-native`: it exports each icon literally so Metro bundles only
  the icons the app renders. Add a missing icon there; never import the
  package's barrel or a package subpath elsewhere.
- Existing Radix icons may stay in established shell surfaces. Do not add Font
  Awesome, Iconify, React Icons, Heroicons, or another general icon catalog.
- Give icon-only controls an accessible name (`aria-label` on web,
  `accessibilityLabel` in React Native), and hide decorative icons from
  assistive technology. Never use color alone to convey state.

## Unit identity icons

Every user-visible or executable unit declares exactly one `vibestudio.icon`.
Choose in this order:

1. The brand mark of a technology the unit directly implements or integrates
   (for example Git, TypeScript, Claude, Svelte, or Gmail).
2. A concrete Lucide object or action for a generic concept (for example
   `file-text`, `database`, `messages-square`, or `shield-check`).
3. A single emoji, only when it says more than a drawn icon would.
4. Original artwork in the repository for a product identity.

### Authoring inputs and stored declarations

`vibestudio.icon` stores either **one emoji** or a **unit-relative image
path**, such as `"./assets/icon.svg"`. Image paths must stay inside the unit,
use normalized path segments, and end in SVG, PNG, JPEG, WebP, AVIF, GIF, or
ICO. The file must exist and be at most 1 MiB. URLs, data URLs, labels, and
catalog IDs are not valid in the manifest; build and installation validation
reject them.

Catalog IDs such as `"lucide:columns-3"` and `"brand:git"` are **authoring
inputs** accepted by `prepareProjects`, `prepareApplication`,
`prepareUnitIcon`, and `setUnitIcon`. Never copy a catalog ID into
`package.json`.

For new panels and workers, pass the catalog ID as the scaffolder's `icon`
argument. For existing units of any executable kind, use `setUnitIcon`. The
offline catalog contains every SVG shipped by Lucide Static 1.27.0, including
aliases. Use `searchProjectCatalog` to find a name:

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

The scaffolder copies only the selected SVG to `assets/icon.svg`, writes
`vibestudio.icon: "./assets/icon.svg"`, and prepares the result in the current
context without publishing. Write the unit's complete authority values before
this call; see [PROJECTS.md](../PROJECTS.md). No icon library ends up in the
unit's runtime bundle.

A valid request reads only the selected SVG, and catalog search lists file
names without loading artwork. Search returns 12 entries by default and at most
500; `listProjectIcons()` returns every id. Newer upstream Lucide releases may
have names that the pinned catalog lacks. An invalid id fails before anything
changes, with suggestions in the error message and catalog matches in the
structured error data. Brand icons are limited to the Simple Icons marks listed
below.

### Change an existing unit

The same catalog works for panels, workers, apps, extensions, and About pages:

```ts
import { setUnitIcon } from "@workspace-skills/workspace-dev";

scope.iconChange = await setUnitIcon({
  repoPath: "panels/inbox",
  icon: "lucide:messages-square",
});
```

This reads the unit at the current working head and updates its manifest and
artwork together in one semantic VCS edit. It leaves the rest of the manifest
unchanged, replaces `assets/icon.svg` if present, and returns a `preparation`
receipt with the new working head. A concurrent edit is reported as a conflict;
check the current state before trying again. The change is not published and
the live unit is not rebuilt; review, verify, commit, and publish it through
the normal workflow.

To use an emoji, pass it directly. To use artwork already in the unit, pass its
`./` path; the operation checks that the file exists at the same working state
and is within the size limit before editing. Switching to an emoji or another
path leaves the previous artwork in place; delete it once nothing else
references it.

### Author a complete unit manually

Apps and extensions follow their own authoring workflows. To include a catalog
icon in their files, call the same resolver:

```ts
import { prepareUnitIcon } from "@workspace-skills/workspace-dev";

const identity = await prepareUnitIcon("brand:git");
// Add identity.files to the unit's files and use identity.icon in its manifest.
// Write the complete candidate, including artwork, in one semantic VCS edit.
```

`prepareUnitIcon` returns `{ icon, files }` and changes nothing. Scaffolding and
`setUnitIcon` use the same resolver, so coloring, licenses, and catalog errors
are the same for every unit kind. Custom paths and emoji are validated and
passed through. Keep artwork square, simple, transparent, and legible at
16–20 px.

Do not use generated initials, hash-derived colors, remote favicons, or remote
SVG URLs. Browser panels show the page's own captured favicon instead of a unit
icon.

### Cross-client coverage

An identity change is not complete until both first-party clients have been
checked:

| Concept           | Desktop shell    | Mobile shell         |
| ----------------- | ---------------- | -------------------- |
| Active panel      | title breadcrumb | AppBar title pill    |
| Panel collection  | tree/sidebar     | drawer tree          |
| Privileged caller | approval card    | approval sheet       |
| Unit installation | install review   | install review sheet |
| Browser identity  | captured favicon | captured favicon     |

Both clients must use the same `icon` value, source path, and browser favicon.
Render with each client's native component (`PanelIcon` on desktop,
`MobileUnitIcon`/`MobilePanelIcon` on mobile); do not add a second identity
field or a mobile-only resolver. On mobile, SVG artwork is rendered with
`react-native-svg`, and React Native `Image` is used only for raster images. Add
focused behavioral tests for every affected row in the table.

## Unit ownership and provenance

Each unit owns its `vibestudio.icon` declaration and its local artwork. Change
the manifest and `assets/icon.svg` together; there is no central table of icon
assignments in the host. Run the workspace tests after changing a unit's
identity so the icon-coverage check verifies every executable unit and its
local asset. Units contain only their own small SVG.

- Semantic icons: Lucide Static 1.27.0, ISC license.
- Brand icons: Simple Icons 16.27.1. The collection is CC0, but individual
  marks remain subject to their owners' trademark and usage rules. Use brand
  marks only to accurately identify the named technology, never as decoration
  or to imply endorsement.
