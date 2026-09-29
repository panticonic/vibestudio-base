# Scaffold workspace projects

`createProjects` creates and publishes repositories in the current workspace's
protected main. This operation does not publish a workspace template to GitHub
and does not require a GitHub destination. Workspace template authoring is a
separate operation described by the templates skill.

| `projectType` | Repository        | Standard scaffold                                                                         |
| ------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `panel`       | `panels/<name>`   | React panel; another installed panel template can be selected explicitly                  |
| `worker`      | `workers/<name>`  | Stateless worker; `agentic` or `durable-service` select the corresponding worker scaffold |
| `package`     | `packages/<name>` | Reusable workspace package                                                                |
| `skill`       | `skills/<name>`   | Reusable cross-repository skill package with its own `SKILL.md`                           |
| `project`     | `projects/<name>` | Content-only repository                                                                   |

Read the [creation API](TOOLS.md#creating-projects) for parameters and the
[development loop](WORKFLOW.md#semantic-workspace-development) for follow-up
changes. Use `verify` on the exact returned repository path for a build check.
For guidance about existing code, edit that repository's own `SKILL.md`.

The repository location is the unit type. `panels/<name>` must be a valid panel,
`workers/<name>` a valid worker, and so on; `package.json` cannot change or
override that classification. Its package name must match the canonical scope
for that location (for example `panels/task-board` is
`@workspace-panels/task-board`). Panel and worker manifests do not use empty
`vibestudio.panel` or `vibestudio.worker` discriminator blocks. Missing,
malformed, mismatched, or foreign-kind manifests are schema failures on the
exact repository path, and protected publication refuses them instead of
treating the repository as content.

Each eval invocation has its own local variables and imports. Import the
functions used by that invocation, even if an earlier invocation imported them.
Store receipts and handles explicitly in `scope` for later calls; module builds
are cached, so repeating an import does not rebuild an unchanged package.
`searchProjectCatalog` searches the curated icon catalog (`resource: "icon"`);
it does not list panel templates. Inspect `templates/` in the current workspace
before choosing a non-default panel template. The Svelte template additionally
uses the installed `@workspace/svelte` package.

Use `createProjects` for one coherent publication of related units:

```ts
import {
  createProjects,
  searchProjectCatalog,
} from "@workspace-skills/workspace-dev";

const [databaseCatalog, panelCatalog] = await Promise.all([
  searchProjectCatalog({ resource: "icon", query: "database", limit: 5 }),
  searchProjectCatalog({
    resource: "icon",
    query: "panels top left",
    limit: 5,
  }),
]);
const databaseIcon = databaseCatalog.entries[0]?.id;
const panelIcon = panelCatalog.entries[0]?.id;
if (!databaseIcon || !panelIcon)
  throw new Error("Required catalog icons are unavailable");

scope.created = await createProjects([
  {
    projectType: "worker",
    name: "task-board-store",
    title: "Task Board Store",
    icon: databaseIcon,
    template: "durable-service",
  },
  {
    projectType: "panel",
    name: "task-board",
    title: "Task Board",
    icon: panelIcon,
  },
]);
return scope.created;
```

Pass a one-element array for a single unit. Each result returns the canonical
repository path, created files, preflight evidence, and publication receipt.

If publication fails after creation, follow the structured retry policy and
recover or repair the already-created repository — never call `createProjects`
again. If a later open or snapshot fails, resume from the stored creation
receipt. An existing destination is not part of the attempt; choose a distinct
name or stop.

Use context-local project files when the user wants private scratch content
rather than a published executable unit. For source adoption, use explicit
copy, compare, and merge operations that preserve provenance; source ancestry
does not grant access or install a live upstream.

## Fork existing source

Use `forkPanel({ from, name, dryRun })` or `forkWorker({ from, name,
classMap?, dryRun })` from `@workspace-skills/workspace-dev` to derive a new
source repository from an existing one. A source repository need not already
have a running panel. Opening its source only launches that code; it does not
create a derived source repository.

First inspect a dry-run result for the selected source and destination. If its
preflight is clean, run the same request without `dryRun: true`. Keep the
returned committed publication receipt in `scope`; it identifies the created
repository and source ancestry. Open the returned panel source, then observe and
snapshot that handle to verify the result. See [forking tools](TOOLS.md) for the
full result and worker class-map contract.
