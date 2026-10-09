---
name: api-integrations
description: Connect, use, or diagnose external APIs through host-mediated credentials and egress.
---

# API integrations

The host holds credentials, binds each one to URLs, and applies them only to
requests it sends on the workspace's behalf. Workspace code never receives,
logs, or relays secrets.

Use `docs_search`/`docs_open` for the current `credentials` schemas. The
workspace client is in `packages/runtime/src`; host-side wire schemas are in the
service-schema package.

## Existing credential selection

Use `credentials.resolveCredential({ url })` to find the credential for a URL.
The host matches audience and intended use; a URL with no bound credential
returns `null` without opening UI. Do not rebuild the matching from inventory
summaries: they describe lifecycle state and miss binding, transport, label, and
selection rules.

A matched credential can still need use authorization. If the caller runs with
a quiet or pregranted-only policy, keep that policy and report that
authorization is needed instead of starting account setup.

## Missing credentials

A missing credential is a normal setup state. Ask only for the non-secret
facts needed to identify the provider and audience. Do not open a prompt with
placeholder endpoints, search source code for a secret, or fall back to a
lower-level credential service.

Credential IDs are opaque; keep the complete returned value, including any
prefix. In diagnostic probes, convert only the "credential unavailable" outcome
to `{ missing: true }` and rethrow everything else. Do not return raw errors,
metadata, or request details.

Call the setup API once. A denial or cancellation ends that attempt.

## Setup experience

- Use one persistent `inline_ui` workflow for multi-step setup. Its controls
  call trusted helpers directly.
- Put provider-console links next to the step that needs them. Offer
  `openPanel(...)` and `openExternal(...)` when both apply.
- For OAuth authorize URLs, pass the expected redirect URI to
  `openExternal(...)` so the host validates the callback.
- Ask about what the user wants to do, not about OAuth vocabulary, credential
  formats, or storage. Put unusual choices behind an advanced option.
- Collect secrets only through host credential input or a dedicated provider
  workflow, never through chat, feedback forms, or panel React state.
- Keep provider choice, access intent, browser action, progress, errors, and
  retry in the same workflow for each connection attempt.

GitHub, Google Workspace, and web-search providers have their own skills; use
those.

## Credential mechanisms

Import `credentials` from `@workspace/runtime` (not an ambient eval global).
Prefer provider OAuth over static tokens when available.

| Method                       | Use for                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `requestCredentialInput`     | User-entered static API keys or tokens                                              |
| `connect`                    | Host-owned OAuth (host stores tokens; userland supplies public config and audience) |
| `configureClient`            | Separate OAuth client material storage                                              |
| `fetch`                      | Authenticated HTTP requests                                                         |
| `gitHttp`                    | Git smart HTTP                                                                      |
| `forAudience` / `hookForUrl` | Only when their live schema matches the caller's transport                          |

Read the live schema for the supported OAuth flows. Use authorization code
with PKCE for interactive clients that can receive a redirect, device code when
callbacks can't reach the server, and client credentials only for a service
identity.

When the user needs long-lived access, check the stored result's lifecycle
fields. Requested scopes or a refresh token alone do not guarantee renewal.
OAuth client configs are bound to their endpoints; create a new config when the
endpoints change.

## Using credentials

```ts
import { credentials } from "@workspace/runtime";

const response = await credentials.fetch(
  "https://api.example.com/items",
  undefined,
  { credentialId },
);
```

The credential's audience must cover the destination URL. Never put tokens
into URLs or headers yourself.

For unmanaged Git, use `@vibestudio/git` with `credentials.gitHttp()`. For
shared managed repos, use the runtime `git` provider and [Git
Bridge](../../extensions/git-bridge/SKILL.md). Remote declarations contain
HTTP(S) URLs without credentials plus logical credential names, never secrets.

To bring in an external Git project, import the remote through Git Bridge. The
import returns an unpublished semantic candidate and does not advance protected
main. Inspect the candidate and publish only when authorized.

The Personal template provides an optional guided account setup in
`skills/onboarding`; open that workspace to use it.

## Incoming webhooks

Use the [runtime webhook lifecycle guide](../sandbox/RUNTIME_API.md#webhook-subscriptions)
together with the live `webhooks` method docs and the authority contract of the
unit that owns the receiver. The guide covers target discovery, request
verification, secret rotation, and cleanup. Storing a credential does not
verify incoming requests; configure a verifier.

Creating a subscription registers a receiver but does not call it. Delivery
invokes the selected method only after an incoming request passes the
configured verifier. To test registration or rotation temporarily, the guide
uses a documented read-only method on the agent's own source and revokes the
subscription in `finally`. A real integration needs its own delivery handler;
do not point the subscription at an arbitrary method or another source. Keep
verifier and rotated secrets out of tool results and conversation messages.
