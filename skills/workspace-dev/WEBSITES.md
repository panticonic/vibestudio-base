# Workspace-enabled websites

An installed panel and a website use the same application component and the
same typed `@workspace/runtime` API. Only host admission and document lifetime
differ; RPC methods, envelopes, streams, cancellation, and receiver contracts
are shared. Do not add a website proxy, bearer-token bootstrap, alternative
credential route, or reduced copy of the API to make a call work.

Desktop and mobile host documents natively behind a shared provider contract.
Android compiles and the focused document-lifecycle tests pass; iOS still needs
macOS compilation and device acceptance. The full endpoint and resource audit
and the reviewed Pages publication acceptance are not finished. Check live
contracts before promising that an operation works.

## Start with zero workspace access

Importing the standalone SDK neither connects nor makes workspace RPC calls.
Use the standard control from the React entry point: the runtime manages the
connection state, and `@workspace/react/connection` renders it, with labels and
user actions. An installed panel is already admitted and never asks for website
connection approval.

```tsx
import { WorkspaceConnection } from "@workspace/react/connection";

export function App() {
  return <WorkspaceConnection />;
}
```

The control handles waiting, denial and retry, disconnect, and revocation with
native buttons and an accessible status message. Mounting it does not connect,
and unmounting does not disconnect. It inherits page styling; customize it with
`className` or `.vibestudio-workspace-connection`. Multiple controls show the
same runtime state. Approval always happens in trusted host UI, never in a
dialog the website renders. The destination is the workspace containing the
page; the website cannot choose another. Outside Vibestudio the control explains
where to open the page; it does not connect a regular Chrome or Safari tab.
Installed panels have no website Disconnect action.

For non-React or custom UI, use `workspaceConnection` from
`@workspace/runtime`:

- `status` is `unavailable`, `disconnected`, `connecting`, `connected`, or
  `disconnecting`.
- `error` is the message of the last failed action, or null.
- `available`, `connected`, and `kind` are local state.
- `subscribe(listener)` returns a cleanup function.

Call `connectWorkspace()` directly from a fresh user action. A page cannot open
the connection prompt from a timer, an import, a background retry, or a resource
request. The host consumes the trusted input event before admission begins, and
page message payloads cannot fake it. After a denial, let the user choose
Connect again. Never automate the approval prompt or disguise another action as
Connect.

Until the connection succeeds, **all workspace interactions fail**, including
methods that are otherwise open, discovery, callbacks and subscriptions, and
operations covered by saved resource grants. Knowing a provider is available
grants nothing. Connecting requires its own approval and does not grant model
credentials, filesystem access, private metadata, or publication rights.

## Call and expose ordinary APIs

Once connected, call the same typed clients an installed panel uses. Find the
receivers actually exposed to websites in the live docs. Each operation goes
through the usual resource acquisition flow; do not call a separate permission
request API first. See [website
authority](../capabilities/references/website-authority.md) for eligibility,
resource scope, and handling denials.

Every exposed method, streaming handler, and event intake must state a website
policy. For a genuinely public, bounded application receiver:

```ts
rpc.expose("readPublicSummary", () => publicSummary, {
  kind: "eligible",
  rationale:
    "Returns only the application summary deliberately shared with connected websites.",
});
```

For internal UI control, declare `kind: "closed"` with a concrete `reason`.
Eligibility does not authorize protected resources or bypass receiver
contracts. Worker `@rpc` options and extension method schemas carry the same
`website` policy, and leaving it out is a definition error. Review streams and
event callbacks as carefully as request/response methods.

### Shared workspace conversations

Use the conversation client exported by `@workspace/runtime` in both installed
panels and connected websites:

```ts
const chat = createConversationClient(rpc);
await chat.history(channelTargetId);
await chat.send(channelTargetId, text);
await chat.subscribe(
  channelTargetId,
  "website-participant",
  metadata,
  onRecord,
  { signal },
);
```

`channelTargetId` is the exact Durable Object target resolved by the host, for
example `do:workers/pubsub-channel:PubSubChannel:<channel-key>`. It is not a
channel name for the website to look up through `workers.resolveService`;
service discovery stays under host control. The channel log is the normal
workspace conversation store. Replay, send, and subscribe from a website are
each reviewed separately, are subject to the usual workspace membership and
model approvals, and never return account credentials. Abort the subscription
when the document disconnects or unmounts, the conversation changes, or the
user stops the stream. Work the receiver has already accepted follows the
receiver's own cancellation rules and is not rolled back when the document
goes away.

## Treat disconnection as runtime retirement

Subscribe to `workspaceConnection` and dispose of the subscription on unmount.
On disconnect or document replacement, clear private results, abort local work,
and drop late results from the old connection. Tag async UI work with a
connection generation so an old response cannot fill in a newly connected page.
Use `disconnectWorkspace()` for an explicit Disconnect action on the website.
Disconnecting ends live access; forgetting saved permissions is a separate host
action.

A stable panel slot, URL path, title, icon, or JavaScript object does not
identify a live execution. A reload or navigation needs a new document
connection. A remembered origin permission can satisfy that request after the
user clicks Connect, but it never connects a replacement document
automatically.

## Package and publish the panel

Declare `vibestudio.website.entry` in the panel manifest, and keep the browser
entry to a small mount of the shared application component. The Host builds the
workspace state into immutable browser artifacts. Workspace userland adds the
HTML shell and public build manifest, reviews the full file list, and calls
provider APIs with credentials supplied through the host.

Read the [website publishing skill](../website-publishing/SKILL.md) for Vercel,
Cloudflare Pages, and GitHub Pages. Its provider adapters handle account and
project selection, upload protocols, receipts, retries, observation, and
verification. The Host holds the credentials and short-lived upload tokens.
Publishing never adds a second runtime bridge or changes the connected page's
authority model.

Never include credentials, document challenges, connection handles, workspace
state, transcripts, tool logs, or private source in public assets. In the real
host, test normal browser loading, disconnected behavior, connecting and
denial, scoped operations, document replacement, and revocation.

For template offers and inspecting template source, see
[templates](../templates/SKILL.md). A template link opens a trusted review and
gives the website no workspace access. Panels, workers, and connected websites
share `workspaces.create(input)` and `workspaces.receipt({ operationId })` from
`@workspace/runtime`:

1. Inspect the source with `templates.inspect()` and pass its exact pin as
   `rootTemplate`, together with `workspace` and a persistent `operationId`.
2. Save the ID and the exact input before submitting.
3. If the result is uncertain, read the receipt with the same ID. Do not create
   a new ID just because the page reloaded.
4. A null receipt means you may retry the original request unchanged. A deleted
   receipt is final and does not permit creating the workspace again.

The caller does not supply the account, source workspace, or requester
identity; the host attests them. Website receipts survive document replacement
within the same authenticated user, workspace, and origin, once the page has
connected again and passed receipt authorization. They carry no routing
credentials or access to the new workspace. Panels and workers use their
authenticated runtime identity. Trusted creation links and programmatic
creation go through the same hub lifecycle.
