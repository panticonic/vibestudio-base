---
name: templates
description: Discover, create, publish, and agentically review workspace updates and their app compatibility.
---

# Workspace templates

This skill covers whole workspace templates. For a new or forked panel/worker
repository inside an existing workspace, including dry-run fork plans, use
[workspace development](../workspace-dev/PROJECTS.md); a project scaffold is a
different kind of source.

`@workspace-extensions/templates` fetches template sources at exact versions,
inspects manifests, composes dependencies, and publishes snapshots. A template
is a Git repository with `meta/vibestudio.yml`, which may declare other
template repositories as dependencies. Templates grant nothing.

Base has no dependencies; Personal and System are separate templates that
depend on Base. Creating a workspace fetches those repositories recursively,
merges their manifests and inventories, and runs from the resulting
materialized source. The new workspace isn't connected to any other running
workspace.

- [public-contract.json](public-contract.json): method shapes.
- [Workspace creation](references/workspace-creation.md): folder, URL, link,
  and recovery behavior.
- [Template authoring](references/template-authoring.md): publishing.
- [Workspace updates](references/workspace-updates.md): update automations,
  source checks, notifications, semantic review, and host compatibility.

## Add a workspace

Open **Add workspace** from the sidebar or onboarding and choose a host folder
or a Git URL. For a folder, the host captures its current bytes, including
unpublished changes, and reviews that snapshot; the path never reaches
workspace code. Development checkouts selected at launch are acquired the same
way.

Websites can offer an Add workspace link. Build it with the shell-surface link
builder so the Git URL is encoded correctly:

```ts
import { createShellSurfaceLink } from "@vibestudio/shared/shellSurface";
const href = createShellSurfaceLink({
  kind: "workspace-chooser",
  sourceUrl: "https://github.com/owner/workspace",
});
```

The link pre-fills the source for review and works from browser and installed
panels; it doesn't create a workspace. Its literal form is
`vibestudio://surface?v=1&kind=workspace-chooser&source=ENCODED_GIT_URL`. Use
connected accounts for private repositories, not credentials in the URL.

Agents can inspect a remote source through the installed extension:

```ts
import { extensions } from "@workspace/runtime";
return await extensions.invoke("@workspace-extensions/templates", "inspect", [
  { url: "https://github.com/owner/workspace" },
]);
```

Call `inspect` with an already reviewed `{ pin }` or with
`{ url, credential? }`. The result has the exact immutable `pin`, the source's
self-described presentation, validated dependency declarations, and the
repository and file inventory. Pass the pin to workspace creation as
`rootTemplate`, creating a new independently running workspace. Local
snapshots selected on the host are already inspected; don't re-fetch their
unpublished checkpoint from remote Git.

To bring selected source into an existing workspace, use VCS compare and
merge operations and record the usual source baseline. Template metadata
doesn't set merge precedence or apply provider, trust, credential, or
authority settings.

## Copy selected source between workspaces

Native System clients use `prepareSelectedTransfer` from
`@workspace/workspace-transfer`, a shared client library over the
authenticated `vcs` and `blobstore` services. It is not an application RPC
bridge, creates no RPC permission, and shares no runtime state. (Application
RPC needs an explicit destination, deliberately exposed receiver methods, and
both workspaces' boundary policies on top of operation authority; see
[RPC](../workspace-dev/RPC.md).)

Inputs:

- the source workspace, its VCS state (read `vcs.mainState()` to capture
  protected main without creating an observation context), and the explicitly
  selected repository/file paths;
- the destination workspace, repository path, review context ID, and expected
  working head;
- source/destination labels and the audience from the current hub/account
  selection;
- a client factory bound to that hub/account. Its VCS client needs
  `listFiles`, `status`, `importSnapshot`, `registerExternalDelta`, `compare`,
  and `merge`; its blobstore client needs `getBase64` and `putBase64`.

`prepareSelectedTransfer(input, getWorkspaceClient)` returns an immutable
`preview` and `execute()`. The preview lists source and destination
filenames, digest, mode, byte count, and audience; preparing sends nothing.
Review it and recheck destination membership before `execute()`. The native UI
confirms the audience: only the owner for a private workspace, otherwise all
current and future authorized members. Confirm again if that policy changed,
or if the review promised a specific member list that changed. Selections are
limited to 200 regular or executable files and 4 MiB; oversized files are
rejected from metadata before their bytes are fetched.

For a new review branch, reserve an ID locally and call
`runtime.createContext({ contextId })` only after the user confirms Copy. Use
the destination main event as `expectedWorkingHead`; execution checks the new
context's head before revealing source content and requires a fresh review if
main moved. It also rechecks access on both sides and verifies every copied
digest. It transfers the selected bytes with a new import boundary, never
source history, runtime data, membership, credentials, or grants.

Without a destination `repositoryId`, execution imports the selection as a new
repository in the review context. With one, it registers an external delta
covering only the selected destination paths and returns normal compare/merge
results; unselected files are untouched. The baseline is the selected
destination content, so this is an explicit copy, not an ancestry-preserving
merge. A real merge against an authored baseline needs that baseline to be
available and authorized, and uses the external-delta workflow.

An existing-repository result may have conflicts or unfinished merge pages:
continue with VCS review and explicit resolution, then commit and finalize the
delta. A new-repository import is committed locally by the import itself.
Neither pushes to main; publishing is a separate review and approval. Keep the
operation ID to reconcile the command if the connection drops during
execution.

## Author and publish

Call `authoringParts`, then `inspectAuthoring` with
`{ name, description, parts }`. Dependencies come from the current workspace's
`meta/vibestudio.yml`, not the request. In `requiredParts`, repositories
provided by declared dependencies are excluded, and workspace-package
dependencies and runtime companions owned by this template are included.

Publish the unchanged inspection with `publishAuthoring`, passing its
fingerprint, a version, an explicit destination, and a fresh command ID. The
returned URL, ref, commit, and snapshot identify the release; share the source
URL or a source link so others can review it and create a workspace.

Logical credential names may be recorded. Concrete credential IDs are used
only for the publication call and never written into the snapshot.
