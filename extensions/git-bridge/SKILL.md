---
name: git-bridge
description: Import or export managed repositories through external Git remotes, configure upstreams, diagnose synchronization, or develop extensions/git-bridge. Use for git.upstreams, git.remotes, pull, push, repository publication, and deciding between semantic VCS and Git operations.
---

# Git Bridge

Git Bridge moves repository content between semantic VCS and external Git
remotes. Semantic VCS manages workspace state, identity, provenance,
integration, commits, and protected `main`. Git handles external commits, refs,
checkouts, and transport. Read [Vibestudio VCS](../../skills/vibestudio-vcs/SKILL.md)
before changing managed content.

```text
Git HEAD -> immutable snapshot -> unpublished semantic candidate
                                      |
                            compare and merge
                                      v
working applications -> commit -> protected main -> Git export
```

The server checkout under `state/git-checkouts/<repoPath>` is disposable. It is
never managed source, build input, or semantic history.

## Discover the public contract

- Workspace code uses the typed `git` namespace from `@workspace/runtime`.
- Agents can look up its current schemas with `docs_search` and `docs_open`.
- Command-line workflows use `vibestudio vcs git`; run
  `vibestudio vcs git --help` for the current commands and flags.

Do not call the extension package directly from userland.

```ts
import { git } from "@workspace/runtime";

await git.setSharedRemote("projects/bgkit", {
  name: "origin",
  url: "https://github.com/acme/bgkit.git",
  branch: "main",
});
await git.setUpstream("projects/bgkit", {
  remote: "origin",
  branch: "main",
  credential: "github-workspace",
  autoPush: false,
});

const status = await git.upstreamStatus(["projects/bgkit"]);
```

An empty repository list returns every configured upstream. Each status call
queries the remote. If that query fails, do not report previously recorded
relationship or commit counts as current.

## Import and pull

`git.importProject()` configures and clones a repository that is not yet in the
workspace. `git.pullUpstream()` fetches a configured upstream. Both return an
unpublished semantic candidate; neither advances protected `main`.

1. Preview a pull with `dryRun: true` when the remote may be ahead or diverged.
2. Keep the returned candidate context and event.
3. From the working context you intend to change, compare and merge the
   candidate through semantic VCS.
4. Run focused checks, commit the complete local application chain, and publish
   it explicitly.
5. Read upstream status again before exporting or pushing.

Import rules:

- An import captures one complete Git HEAD tree. If no branch is given, use the
  remote's advertised default branch.
- Reject dirty checkouts, unsupported entry modes, excluded paths, and
  snapshots larger than the semantic import limit. Never truncate or silently
  drop tracked content.
- Keep credentials out of remote URLs and record only a credential-free source
  URI.
- Do not infer semantic moves, copies, or authorship from Git history or
  similarity heuristics.

The candidate result includes the context, event, and semantic import evidence.
When verification matters, inspect those roots with `provenance`. The source
URI and revision identify the imported snapshot; they do not assign per-file
authorship.

## Export and push

Export reads one specific protected-main repository state and writes only its
tracked files, deletions, and executable modes. The exported Git commit carries
trailers with the semantic repository, state, and event, so the bridge can
recognize its own exports without a separate identity store.

- `git.pushUpstream()` exports and pushes protected `main`.
- `git.publishRepo()` resolves or creates a provider repository, configures
  it, exports, and pushes. Each step is idempotent, so calling it again with
  the same input resumes after a failure.
- Auto-push may export an already-published event, but it must stop while an
  import candidate is unresolved.
- Force-push is an explicit recovery action that requires evidence of what will
  be overwritten and user approval.

Refuse export or push when status is `integration-required`. Report specific
states such as `auth-failed`, missing branch, and `diverged` as they are; do not
turn them into a generic failure or retry with broader permissions.

## Responsibilities and safety

- The extension handles server-local checkouts, Git processes, transport,
  provider dispatch, and per-repository locking.
- Semantic VCS handles managed content and publication. The bridge may read
  specific states and import snapshots, but it cannot publish semantic changes
  on its own.
- The host handles policy, approval, credentials, and workspace configuration.
- Provider packages handle provider-specific repository creation and API
  checks.
- Credentials pass through the host-mediated Git HTTP adapter. Never expose,
  log, or return tokens, or put them in URLs.
- Clients reach the bridge by RPC through the connected server. Do not add
  client-filesystem shortcuts for remote sessions.

## Diagnostics and development

Address the live bridge by its release key, the extension name:

```ts
const release = {
  kind: "extension",
  releaseId: "@workspace-extensions/git-bridge",
} as const;
const [bridge] = await runtime.supervision.describe(release);
if (!bridge) throw new Error("Git bridge is not live");
return runtime.supervision.health(bridge.identity, { level: "warn" });
```

For the API shape, read `packages/service-schemas/src/gitInterop.ts` and the
live generated docs. For the implementation, start with `index.ts`,
`bridge.ts`, and `upstream.ts` in this extension and follow their imports. Run
the focused bridge tests and the affected schema, runtime, CLI, and
configuration tests. Run repository-wide doc checks only when a public contract
changed.

Git remote and upstream settings belong to the Git provider’s private state.
Remote/upstream settings and operation history are stored together in the
canonical version 1 state. A missing store starts with empty settings; existing
settings remain authoritative and are not overwritten by source edits. Invalid
state or a failed atomic write is reported without replacing the stored file.
Use the Git service to change settings.
