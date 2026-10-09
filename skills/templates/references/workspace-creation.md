# Add a workspace

Use this workflow when the user wants to run a workspace from a local checkout
or a Git endpoint. The result is a separate workspace with its own panels,
runtime data, membership, and approvals. Existing workspaces are selected in
the sidebar.

## Open the creation surface

The sidebar Add action and the onboarding **Add workspace** link open the
same creation surface. Offer **Start fresh** to create a workspace from the
configured Base, or let the user select a source. For panel navigation, use
`createShellSurfaceLink` from `@vibestudio/shared/shellSurface`:

```ts
const href = createShellSurfaceLink({ kind: "workspace-chooser" });
```

Navigate to this link in the client that started the request. Don't call a
host filesystem API from an agent or guess a path. Opening the surface
doesn't create or approve a workspace.

## From a folder

In the desktop creation surface, select **Folder**, then **Choose folder…**.
Pick the root of a workspace source checkout, which contains
`meta/vibestudio.yml` and the repositories it lists. Folder acquisition
currently expects a Git checkout with an origin URL. It captures tracked and
non-ignored untracked changes into a snapshot it owns, without committing or
changing the original checkout.

Review the returned name and contents, then create the workspace from that
snapshot. The snapshot may be unpublished, so don't ask the templates
extension to fetch its pin from remote Git. Cancelling the native picker
leaves no source selected. A folder belongs to the computer that can read it;
a remote desktop session can't treat a client-local path as a server path.

For development, `pnpm dev --template-checkout PATH` offers a checkout as an
available source, and `pnpm dev --workspace-checkout PATH` starts with that
checkout as an extra workspace alongside Personal and System. Both capture the
checkout's current visible source state the same way as the folder flow.

## From a Git URL or website

Select **Git URL**, paste a credential-free HTTP(S) Git URL into **Workspace
source address**, then choose **Review workspace** (mobile: **Review
source**). Private repositories use a connected account; never put a password
or token in a link.

A website can prefill the same review surface:

```ts
const href = createShellSurfaceLink({
  kind: "workspace-chooser",
  sourceUrl: "https://github.com/owner/workspace",
});
```

Use the returned string as an anchor `href`. The encoded form is
`vibestudio://surface?v=1&kind=workspace-chooser&source=ENCODED_GIT_URL`.
In a desktop browser panel, both same-window and new-window links open the
creation surface; on mobile the surface opens as the creation sheet. The link
carries only the source; it can't supply a local filesystem path, create a
workspace, or grant the website access.

Inspection resolves the Git source to a specific commit and content digest,
validates the workspace manifest and complete source inventory, and shows a
review. Creation uses that inspected pin and doesn't re-resolve a moving
branch afterwards. The new workspace may still need unit/authority review
before its first panels run.

## Create from a panel, worker, or connected website

Use the shared runtime clients. A website must first complete the explicit
workspace connection; installed panels and workers use their already admitted
runtime.

```ts
import { templates, workspaces } from "@workspace/runtime";

const inspected = await templates.inspect({
  url: "https://github.com/owner/workspace",
});
// Retain this exact request in caller-scoped durable storage before submitting.
const request = {
  operationId: crypto.randomUUID(),
  workspace: "My app",
  rootTemplate: inspected.pin,
};
const receipt = await workspaces.create(request);
```

If you don't know whether a submission went through, reconnect if necessary
and call `workspaces.receipt({ operationId: request.operationId })`. A receipt
identifies the existing result; a null receipt means you may resubmit the
original request. Never generate a new operation ID to retry after a network
error. A deleted result stays deleted. For changed input, start a new
operation deliberately, after resolving the previous submission.

The hub owns creation, initial membership, and receipts, for both links and
RPC. It derives the account and source identity from authenticated host
evidence; callers can't choose them. For websites, receipt ownership is stable
across fresh documents from the same user, source workspace, and origin, but
each delivery requires a current connection and permission. Panels and
workers use their authenticated runtime identity. Receipts contain no routing
credential and no permission to inspect the created workspace; opening it is
a separate trusted workspace action.

## Outcomes and recovery

- A failed inspection creates no workspace. Report the specific source or
  manifest error; don't substitute a different snapshot.
- If a connection failure interrupts creation, its operation ID is kept. Use
  **Continue previous creation** to reconcile it instead of creating a second
  workspace.
- If creation succeeded but opening failed, use **Open workspace** to reopen
  the existing result. Don't create it again.
- A new source link replaces an idle review session, and results from older
  inspections must not replace its selection. A pending creation is
  reconciled separately.

To edit selected files in the current workspace, use the source-copy or VCS
import/merge workflows instead. Workspace creation materializes the selected
template and its dependencies as one new workspace; it doesn't share another
workspace's runtime or inherit grants. See
[workspace RPC](../../workspace-dev/RPC.md) for cross-workspace integration
after creation, and [authoring](template-authoring.md) to publish a workspace
template that others can add.
