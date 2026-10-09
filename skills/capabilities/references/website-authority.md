# Website authority and escalation

Installed code and browser documents use the same authority system. Website
identity changes admission and the available grant subjects; it doesn't add
another RPC or approval stack. See
[website development](../../workspace-dev/WEBSITES.md) for connection code and
current limits.

## Three independent checks

| Check                | Meaning                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace connection | A separate explicit user approval for this authenticated document to take part at all. Disconnected calls fail before discovery or acquisition.             |
| Method eligibility   | The receiver declares `website: { kind: "eligible", rationale }` or `{ kind: "closed", reason }`. No grant unlocks a closed method.                         |
| Operation authority  | The receiver's tier, principals, resource, relationship, integrity, and disclosure rules decide whether an eligible call needs a grant or a fresh decision. |

`open`, `gated`, and `critical` describe operation authority only, not the
connection check or eligibility. An operation open to installed code can
still have a website-specific resource requirement. Eligibility alone grants
nothing, critical effects still need a fresh decision, and cross-workspace
exposure and both workspaces' boundary policies are separate requirements.

"Acquire" means the real operation goes through normal acquisition when it
lacks an eligible grant. Don't add an approval for asking for another
approval. Workspace connection is the only intentional separate prerequisite;
never connect implicitly while discovering or attempting a protected
operation.

## Authenticated subjects and duration

The host binds a website subject to the authenticated user, workspace, and
canonical HTTP(S) origin. Each live document has fresh execution evidence and
a revocation generation; pages can't supply or override these.

Saved website permissions bind to that subject plus their recorded
constraints. Page-scoped permission ends with the document or connection.
Remembered permission can apply to later explicitly connected documents from
the same origin, user, and workspace. A different site never inherits
authority by loading in the same panel. Replaying saved handles can't restore
access after a generation is invalidated, a connection grant withdrawn,
membership lost, or document evidence retired.

An origin is scheme, host, and port, not the URL path:
`https://owner.github.io/project-a/` and `/project-b/` are one subject. Use
separate origins when you need independent trust. Plain HTTP pages also need a
disclosure that network intermediaries can change the code receiving
workspace data.

Ongoing website access covers whatever code the site serves later. Don't
derive a reviewed version from a URL, ETag, title, or panel ID. Installed code
can have execution-digest evidence; keep per-version choices where sensible,
especially for model-provider credential use. Receiver policy recommends one
of the choices it can enforce. Session, expiry, requester-version, and
provider-build limits can coexist; show all of them accurately. Migration for
installed code whose identity changes isn't finished yet.

## Show the effect and who sees the result

A browser-panel approval must show the authenticated origin and website
provenance, even when an installed receiver performs the operation. Use
trusted workspace chrome for consent, with subtle browser and
connected-browser background hues and accessible trust descriptions. A badge,
title, favicon, or prompt rendered by the website proves nothing. The approval
explains the resource, effect, who sees the result, and the offered duration.
Detailed identity evidence may include the source workspace, the initiating
document, and the reviewed receiver or requester version when available.

Connecting a website means trusting code the site can change. A reviewed
receiver performs an approved operation with its normal implementation
authority. Website attribution helps review and auditing; it isn't a
permanent ownership or security label on conversations, data, agent turns,
queues, or later effects. Forwarding must not bypass the website's entry
restrictions, but the system doesn't promise to confine a trusted receiver's
whole implementation to website grants.

Conversations started by websites are normal conversations in the connected
workspace; transcripts, tool logs, sharing, and retention follow its rules. A
private live RPC reply doesn't mean private storage. Use a private workspace
when the user wants their data kept private.

Disconnecting stops new website calls and live result delivery. It doesn't
undo completed changes or cancel work a service already accepted;
long-running operations use their owner's cancellation and receipt APIs.

## Diagnose instead of widening

| Evidence                                                                | Next action                                                                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Provider unavailable                                                    | Render normal page content and explain how to open it in a supported Vibestudio host.                                |
| `EWORKSPACE_DISCONNECTED`                                               | Offer an explicit Connect; don't start discovery or resource acquisition.                                            |
| Fresh user action required                                              | Wait for a new deliberate Connect; never loop.                                                                       |
| Website method closed or missing from filtered discovery                | Review the receiver's policy with its owner; a broader grant can't expose it.                                        |
| Missing eligible resource grant                                         | Let the actual operation request its approval and keep its structured result.                                        |
| Explicit denial, stale document, revoked generation, or lost membership | End that call and clear results held in the UI; follow only the returned remediation.                                |
| Uncertain mutation result                                               | Reconcile through the owner's operation receipt before retrying; a replacement document needs fresh delivery rights. |

Don't catch a denial and retry through an installed parent, agent, extension,
native endpoint, other workspace, raw fetch, or extracted credential. Don't
mark every receiver closed to avoid designing a usable website contract.
Review each operation's resource and disclosure behavior, including
filesystem search and handles, subscriptions, callbacks, private template
metadata, streams, and downstream provider effects. Annotating every method
is not a security review.
