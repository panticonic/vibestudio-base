# Topology and Trust

## The two-tier trust model

Vibestudio separates the **trusted host** from **workspace-authored code**.
Browser panels, workerd workers, and native processes have different
execution boundaries; being in a workspace doesn't by itself contain native
code.

**The host** is the Electron shell (or a headless server plus paired native
clients) and the workspace server process. Only the host owns:

- authentication (tokens, device credentials, pairing) and the permission
  system (grants, approval prompts);
- credential storage and injection on network egress;
- protected VCS refs (`main` per repo) and the approval-gated
  compare-and-swap that advances them;
- the build system and the content-addressed blob and build stores;
- disk projection (materializing workspace state into context folders);
- supervision of workerd, extension processes, and panel webviews.

**Userland** is everything under the workspace root, which is also an agent's
file root. All of it is agent-writable source, versioned in the workspace VCS
and built on demand. The host never runs workspace code in its own process.

Protected application APIs authenticate callers, keep workspace identity, and
gate effects such as publishing `main` or using credentials. Native commands,
builds, and extensions share one workspace runtime: on Unix, stock MXC with
selected filesystem resources and open networking; on Windows, direct
execution with the application's OS-user permissions and no filesystem or
network confinement. Contexts are branches, not native security domains, and
credentials deliberately exposed to a shared workspace are available to its
commands. RPC approvals don't confine raw native effects.

## Unit kinds

Admission identifies the declared package, source, and requested authority;
neither a package name nor its filesystem location grants trust. Native client
hosting also checks for the user's designated System workspace, so a normal
workspace or website can't gain client authority by declaring a `clients/`
path.

| Kind                                | Runs in                                                                                             | Trust                                                | Use for                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| **Panel** (`panels/*`)              | Isolated webview, talks to the server over WebSocket RPC                                            | Sandboxed                                            | User-facing UI                                                              |
| **Worker / DO** (`workers/*`)       | workerd V8 isolate                                                                                  | Sandboxed                                            | Server-side userland logic; DOs are the app-database primitive (`this.sql`) |
| **Extension** (`extensions/*`)      | Native Node process in its workspace runtime                                                        | Source admission plus the platform's native contract | Wrapping native dependencies and long-lived Node services                   |
| **Client** (`clients/*`)            | Trusted top-level program on a device, run by a host: `web` renderer, `react-native` bundle, or `terminal` module | **Trusted** client unit                              | Client software with its own runtime and host ABI                           |
| **Package** (`packages/*`)          | Wherever imported                                                                                   | Same as the importer                                 | Shared libraries                                                            |
| **Project** (`projects/*`), `meta/` | Content only                                                                                        | n/a                                                  | Plain content repos; push is not gated                                      |

Panels and workers keep browser and workerd isolation; native extensions
follow the platform contract above; clients need their own admission of
the exact code. Approving source doesn't make a workspace a host process or
lend it another workspace's grants. New workspaces own their source and
runtime state; adopting Base source creates no live dependency on a Base
workspace.

## RPC vs workspace services

Two separate, non-overlapping systems:

- **Platform RPC** (`@vibestudio/rpc`) works like fetch: one caller, one
  target, one value or one streamed Response. It carries host service calls
  (`fs.read`, `credentials.fetch`, `blobstore.*`), credential proxying, and
  model fetches.
- **Workspace services** are workspace-authored workers/DOs resolved by
  protocol (declared in `meta/vibestudio.yml`, resolved with
  `workers.resolveService`). They work like conversations: multiple
  subscribers, replay, participants, and structured streaming chunks.
  Channels are the main example.

Use RPC for point-to-point call/response; declare a workspace service for
anything with subscribers, replay, or durable multi-participant state.

## Transport identity

Every RPC transport carries two identities:

- `callerId`: the durable application identity (shell, a panel ID, a worker
  ID). It can have zero or more live connections and is safe to persist.
- `connectionId`: the short-lived identity of one authenticated socket.
  **Never persist it.**

Events go either by pub/sub (`emit`, subscribers only) or directly
(`emitToCaller` to every live session of a durable caller, `emitToConnection`
to exactly one transport). On reconnect, `resubscribe` restores the desired
subscriptions, and `cold-recover` is a one-time repair after a server restart.
Handlers must be idempotent across reconnects.

Portable runtimes expose those completed future recovery boundaries through
`rpc.onRecovery(handler)`. It does not replay the initial connection. A
long-lived observation must cancel and join its previous generation, then read
a fresh snapshot after this signal; a `connected` status by itself does not
prove that transport recovery is complete. Recovery handlers should schedule
that reconciliation and return rather than waiting inside the handler for the
new long poll they just started.

## The agentic stack

The agent system is a two-layer userland architecture with no special host
privileges:

```
Panel (chat UI)  ⇄  Channel DO (pub/sub log)  ⇄  Agent Worker DO (embeds Pi in-process)
```

- **Channel DO**: a generic userland pub/sub layer over the unified log, with
  durable envelopes, a roster with unique handles, and replay for late
  subscribers. The chat transcript _is_ a reduction over stored channel
  envelopes; there is no separate transcript store.
- **Agent worker DO**: extends `AgentWorkerBase` (`packages/agentic-do`) and
  runs one Pi runner per subscribed channel. Pi, the coding-agent engine, runs
  _in-process_ in the DO, with no harness child process. The runner turns Pi
  lifecycle events into trajectory events (`message.*`, `invocation.*`,
  `turn.*`), appends them to the workspace store, and publishes selected ones
  to the channel.
- **System prompt**: the base prompt + `meta/AGENTS.md` + a generated index
  with one line per skill (name, path, description). The agent pulls full
  skill docs with `read()`; nothing else is pushed into context.
- **Tools**: the agent's `eval` runs on the server in its own per-agent
  `EvalDO`, as a normal `do`-principal caller. This guarantees reachability:
  anything a DO can call, an agent can reach through eval, with the same
  permission checks and consent prompts. Direct tool allow-lists on host
  services are a UX convenience, not the capability model.
- **Multi-agent**: other agents are more worker DOs on the same channel.
  Subagents are delegated child agents with their own task channel and child
  context. Unique channel handles let participants' advertised methods become
  tools without collisions.

Since agents, panels, and workers are all channel participants and RPC
callers, "what can the agent do?" reduces to "what can this caller identity do
through the permission system?" See SECURITY.md.

## Contexts

A context is an isolated execution environment with its own materialized
**context folder**, context ID, committed event, and working head. Panels in
one context share a filesystem; the chat agent and the panels it spawns
usually share one. Reads stay on the context's event or application state as
`main` advances elsewhere (see STORAGE.md).

Contexts are branches inside one workspace and load no source, state, or
authority from another workspace. Quickfire stays in its target panel's
workspace. The native client comes from the user's private System workspace,
while workspace-local pages such as `about/new` load locally.
