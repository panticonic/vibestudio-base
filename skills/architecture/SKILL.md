---
name: architecture
description: "Design or review cross-cutting Vibestudio architecture: trust boundaries, ownership, agents, state, provenance, permissions, credentials, builds."
---

# Vibestudio architecture

Use this skill to decide which component should own a fact or an effect. Use
the task skills for implementation details.

## Read by question

| Question                                                     | Reference                  |
| ------------------------------------------------------------ | -------------------------- |
| Host/userland boundary, unit kinds, RPC, transport, agents   | [SYSTEM.md](SYSTEM.md)     |
| Durable state, logs, semantic VCS, provenance, blobs, builds | [STORAGE.md](STORAGE.md)   |
| Permissions, approvals, credentials, devices, principals     | [SECURITY.md](SECURITY.md) |

## System model

The trusted host owns identity, protected refs, permission decisions,
credential injection, builds, disk projection, and network egress. Each kind
of workspace unit has its own trust model: panels run in isolated webviews;
workers and DOs run in workerd isolates; extensions run as approved Node
services; apps are approved clients. Agents are workspace participants that
use the same services and permission checks as any other caller.

Source, state, and contexts are local to a workspace. Contexts are branches
inside one workspace and don't give access to another workspace's source.
Quickfire runs in the workspace of its target panel. Personal and System are
private per-user workspaces, and native client code comes from that user's
System workspace. `about/new` and other workspace-local pages load from the
local workspace.

Cross-workspace application RPC needs an explicit destination and a receiver
method exposed for it. The source's outgoing policy and the destination's
incoming policy are checked first and are hard limits; normal operation
authority is checked after them. Naming a target grants no access, and an
approval can't override either workspace's policy. See
[workspace RPC](../workspace-dev/RPC.md).

Conversations and tool activity are stored in the trajectory and channel
logs. Managed source, applications, merge decisions, and publication are
stored in the semantic workspace graph. Materialized files, indexes, Git
checkouts, and build outputs are derived from those records; never let one
become a competing source of truth.

## Invariants

- Keep the trusted host small. Workspace behavior belongs in workspace units
  unless it has to enforce a trust boundary.
- Trust comes from declared identity and review, not from filesystem
  location.
- Store history as immutable facts linked by walkable edges. Caches must be
  disposable and rebuildable.
- Link tool invocations to semantic work through recorded causal edges, not a
  separate claims or provenance store.
- Semantic VCS is the only source of truth for workspace source. Git, builds,
  and filesystem projections are adapters or consumers.
- Authentication identifies the caller; grants and approvals authorize
  effects. Credentials stay on the host and are bound to their audience.
- Protected publication checks ancestry, merge completeness, the candidate
  build, and approval. Runtime activation fails closed and keeps the last
  runnable artifact when a build is bad.

When documents disagree, trust the live generated service contract and schema
first, then the domain skill, then general orientation docs like this one. For
managed source operations, [Vibestudio VCS](../vibestudio-vcs/SKILL.md) is
authoritative.
