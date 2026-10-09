# Permissions, credentials, identity, and content provenance

Read [`skills/capabilities/SKILL.md`](../capabilities/SKILL.md) for the
authoring workflow. This document explains the architecture behind it.

## Tokens authenticate; authority authorizes

A runtime token identifies a caller and grants nothing. The server evaluates
every effect from the authenticated principals, the executing artifact, the
authority session, live workspace relationships, the resource, and content
lineage. Userland can render a prompt but can't approve itself.

The principal families are `host`, `user`, `code`, `session`, and `mission`.
Runtime kinds (panel, worker, Durable Object, shell, extension, agent) are
facts used to derive principals, not authority.

An installed unit's checked-in authority manifest declares what its code may
request; it isn't a grant. Open methods need no grant. Gated methods need the
sealed request and a grant. Critical methods need a fresh approval every time
and never get a standing grant.

Grant durations:

- `once`: one invocation; nothing reusable is stored.
- `session`: one sealed authority session. Its SQLite row survives a host
  restart and is pruned when the session ends.
- `version`: the issuing repository and its exact effective/execution
  version, so a source change invalidates it.

All capability and userland decision rows live in one authority grant store.
Generated catalogs, inferred code use, builds, and docs never create rows.

## Three permission surfaces

1. **Host capability authority** covers host effects such as egress,
   credentials, external browser opens, lifecycle control, and protected
   publication. Receiver contracts declare principals, tier, relationships,
   and resource derivation; never hand-roll this state in a service.
2. **Userland capability authority** protects a resource owned by workspace
   code. The provider manifest declares the capability, the receiver binds it
   to a resource, and the host acquires and stores grants in the same store.
   It can't substitute for host capability authority.
3. **Protected-main publication** checks semantic ancestry and integration
   and authorizes the specific main transition. The gate runs the candidate
   build and typecheck before approval; later builds are derived and can't
   roll back semantic history.

## Static host contracts and dynamic workspace contracts

Static reviewed censuses fit static host methods: any change to a host
method, tier, receiver requirement, or direct target must show as a reviewed
census diff.

Workspace-built services take their declarations from the caller's live
semantic `meta/vibestudio.yml`, and live docs, service resolution, provider
source and effective version, and direct-RPC enforcement all use that same
set. A service can exist in one context and not another. These services must
never depend on a global census generated at startup, and generating docs or
catalogs must never approve anything.

Every boundary still enforces its own checks. The original caller and session
pass through legitimate downstream calls; no host or intermediate service may
substitute its own principal. Receiver-specific ownership checks still matter
alongside the shared evaluator.

## Eval admission and reachability

An agent's EvalDO is a conduit with a fixed code identity and a live
host-created execution session. Interactive eval is admitted only for an
attested task, unattended eval only for an approved mission. After admission,
receiver policy, locks, task/agent/mission grants, and fresh approvals govern
effects directly; the harness manifest neither grants nor limits them.
Infrastructure failures end as structured terminal invocations, and waits for
human approval have no timeout.

## Credentials

The mediated credential APIs are bound to URLs: callers send requests and get
responses without seeing secret bytes. OAuth refresh, audience matching, and
injection stay on the host. External Git uses the same mediated egress
(`credentials.gitHttp()`); workspace code never handles raw tokens.

Credential capture and browser imports belong to the acting user's private
Personal workspace. Personal and System can't be shared. These rules protect
authenticated interfaces; they don't hide secrets from native code running as
the host OS user.

## Content integrity

Each agent session has a durable one-way latch: internal content can become
external, never the reverse. Every ingestion point advances the latch before
bytes become visible. File versions and durable channel messages store the
writing session's class and outside lineage, so copying or paraphrasing can't
launder provenance.

Several outside sources are represented by one content-addressed
`lineage-set:<sha256>` whose members the host stores and verifies. It is
compact, not a summary: the host can list every member for diagnostics and
trust decisions, each new ingestion produces the digest of the combined set,
and unknown or nested set coordinates fail closed.

Read session explanations through `contextIntegrity.explain`. The receiver
derives the session from the verified agent binding, accepts only a set
already in that session, verifies its digest, and returns at most 500 leaves
per opaque cursor. A directory listing counts as ingestion, since names are
content; aggregation keeps it from overflowing the latch's 256-entry
representation without pretending the names weren't read.

The host resolves the stored class of files and messages; callers never
supply a trusted `contentClass` or `externalKeys`. Missing or unknown
provenance counts as external. Standing authority approved before new outside
content arrived can't be used until the new lineage is reviewed.

## Agent runtime boundaries

The workerd agent/eval interface provides a context-scoped filesystem,
mediated credentials and egress, protected-main publication checks, and fixed
code/session identity. Native extensions and commands run under a different
contract: Unix uses MXC resource admission; Windows native processes run with
the host OS user's permissions and can read anything that user can, including
sibling state. Native networking is not always mediated. Per-user RPC
attribution doesn't hide a resource given to a shared workspace's native
command from its other commands.

Content lineage covers what influenced the session and what it writes for
others. Route actions through the typed runtime APIs and fix the contract
when denied; never add a retry, alternate caller, broad wildcard, edit to a
generated manifest, or compatibility path to get around the check.
