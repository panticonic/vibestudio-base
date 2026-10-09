---
name: extensiondev
description: Create or modify trusted Vibestudio extensions — supervised Node services with RPC, optional fetch handlers, and explicit authority.
---

# Extension development

Extensions under `extensions/` are approved Node processes with full Node
APIs, native modules, and network access. On Unix they run in the workspace's
MXC runtime with its selected filesystem resources. On Windows they run with the
application's OS-user permissions and no filesystem confinement. Calls are not
individually sandboxed.

Prefer a worker when a workerd isolate is enough. This skill is for authoring;
to call an installed extension, use the live generated docs and the
`extensions` runtime API.

## Read by task

| Task                                              | Reference                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Package manifest, `activate(ctx)`, API, authority | [AUTHORING.md](AUTHORING.md)                                        |
| External dependencies, overrides, and patches     | [workspace dependency resolution](../workspace-dev/DEPENDENCIES.md) |
| Optional HTTP fetch handler                       | [FETCH.md](FETCH.md)                                                |
| Build, publish, inspect, reload                   | [DEV_LOOP.md](DEV_LOOP.md)                                          |

## Rules

- Put each extension in `extensions/<name>` as a private ESM package with a
  valid `vibestudio.extension` manifest.
- Give each unit a semantic icon per the [icon
  guide](../workspace-dev/references/icons.md).
- Return a plain object from `activate(ctx)`. Its own enumerable function
  properties are the RPC methods.
- Raw Node access is limited only by the workspace's native resource admission.
  `ctx.fs` is scoped to the invoking caller's context; within it, reads and
  writes are unrestricted, and source writes become semantic edits of that
  context. Neither gives a per-call sandbox. Declare protected resources in `authority.provides` and bind methods
  to them with `vibestudio.extension.methodAuthority`. Do not add advisory
  prompts inside methods.
- Log with `ctx.log`. To read supervision health or logs, first select the
  extension's live identity.
- Read [Vibestudio VCS](../vibestudio-vcs/SKILL.md) before editing. Only an
  approved publication to protected `main` triggers a build and activation;
  local or merely committed changes do not update the running extension.
- Add a `SKILL.md` to the extension's repo describing its purpose, trust
  boundary, diagnostics, and any non-obvious topology. For method lists that
  change, point to live docs or code instead of copying them.

## Workflow

Create the package and declare it under `extensions:` in `meta/vibestudio.yml`.
An elevated review then covers its native code and requested authority. Call it
with `extensions.use(...)` or `extensions.invoke(...)` only after activation.

For manifest and runtime shapes, see [AUTHORING.md](AUTHORING.md), the live
generated docs, and the extension host types. When reviewing, start at the
entry point and follow its direct imports. Run focused tests and the smallest
set of manifest, authority, and runtime checks the change affects.
