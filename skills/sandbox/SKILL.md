---
name: sandbox
description: Run server-side eval, build interactive chat UI (inline UI, action bars, custom messages, feedback), automate browser panels, and call runtime APIs. For visual and interactive answers, also read the visualize skill.
---

# Sandbox execution

`eval` runs server-side in the caller's per-agent EvalDO. Inline UI, action
bars, and feedback components render in a connected chat panel.

## Read by task

| Task                                                           | Reference                                          |
| -------------------------------------------------------------- | -------------------------------------------------- |
| Eval, imports, timeouts, cancellation, scope, filesystem       | [EVAL.md](EVAL.md)                                 |
| Portable runtime clients and services                          | [RUNTIME_API.md](RUNTIME_API.md)                   |
| Persistent chat components                                     | [INLINE_UI.md](INLINE_UI.md)                       |
| Pinned panel controls                                          | [ACTION_BAR.md](ACTION_BAR.md)                     |
| Typed custom transcript messages                               | [CUSTOM_MESSAGES.md](CUSTOM_MESSAGES.md)           |
| Rich chat content, images, videos, and generated image sharing | [MDX.md](MDX.md)                                   |
| Blocking user feedback                                         | [FEEDBACK.md](FEEDBACK.md)                         |
| Chat and channel operations                                    | [CHAT_API.md](CHAT_API.md)                         |
| Panel/browser CDP automation from eval                         | [BROWSER_AUTOMATION.md](BROWSER_AUTOMATION.md)     |
| Full CDP page and session reference                            | [BROWSER.md](../workspace-dev/BROWSER.md)          |
| Common recipes                                                 | [PATTERNS.md](PATTERNS.md)                         |
| Choosing an interaction surface                                | [INTERACTION_PATTERNS.md](INTERACTION_PATTERNS.md) |
| Visual answers and response components                         | [visualize](../visualize/SKILL.md)                 |

Inside eval, `help()` lists the injected and importable runtime surface and
`help("<binding>")` lists a binding's methods. For live service schemas use the
`docs_search` and `docs_open` agent tools; they are not eval functions.

## Execution surfaces

| Surface                             | Runs in            | Use for                                                  |
| ----------------------------------- | ------------------ | -------------------------------------------------------- |
| `eval`                              | server-side EvalDO | imperative code, services, files, persistent agent scope |
| `inline_ui`                         | chat panel         | persistent interactive transcript content                |
| `load_action_bar`                   | chat panel         | compact controls pinned above history                    |
| `feedback_form` / `feedback_custom` | chat panel         | responses the agent must await                           |

Headless sessions have no panel-only tools. Without a connected renderer, return
data from eval and reply in plain conversation.

## Eval essentials

Eval has these ambient bindings: `scope`, `scopes`, `db`, `ctx`, `help`, and,
when the eval is agent-owned, `chat` and `agent`. The portable clients (`rpc`,
`services`, `fs`, `workers`, `credentials`, `gad`, `panelTree`) are injected and
can also be imported from `@workspace/runtime`.

Workspace and platform packages resolve on first use. Inline code declares npm
packages in the eval `imports` map; code loaded from a file infers them from the
nearest `package.json`. Use static relative imports. See [EVAL.md](EVAL.md).

Eval `db` and `scope` belong to the agent's EvalDO. Scope keeps serializable
values and runtime handles (panel, worker, DO, CDP session) across reloads but
cannot restore other functions or live objects. Do not use
eval storage as an app database: put shared application data behind a
manifest-declared Durable Object service with narrow RPC methods.

`panelTree.self()` returns the EvalDO runtime, not the visible chat panel. To
find the visible parent, siblings, or children, use bounded panel-tree reads,
then read the target panel's state args for its channel id.

Account, workspace membership, live presence, channel participants, and runtime
identity are separate APIs that answer different questions; see
[RUNTIME_API.md](RUNTIME_API.md). An agent or runtime entity never identifies a
verified user.

Every eval call runs in the current workspace and context. Contexts are branches
within one workspace; they cannot load source from another workspace. Quickfire
stays in the workspace of its target panel. An RPC call can name one exact
destination workspace in its call options; without one it targets the current
workspace and never searches others. A cross-workspace call needs all of:

- the receiving method exposed with `crossWorkspace`;
- the source workspace's outgoing policy allowing it;
- the destination workspace's incoming policy allowing it.

These policies are checked before service and capability permissions, and
neither workspace code nor an approval can enable them.

## Component essentials

Inline UI, action-bar, and feedback source files must default-export a
component. Read the matching reference for its props and lifecycle. Component
scope is local to the browser panel; it is neither eval scope nor shared
application state.

Reuse a stable inline UI id when rerendering the same workflow. Send follow-up
prompts on the user's behalf with `chat.send(...)`. Publish custom visual state
only through the typed custom-message APIs, and never construct raw transcript
rows.

Prefer showing to telling. When a visual or interactive answer serves the user
better than prose, answer with response components, a one-off component defined
in the message, or inline UI (see [visualize](../visualize/SKILL.md)). Use
inline UI for surfaces that refresh, call workspace services or runtime APIs, or
that the user comes back to. Use feedback only when you cannot continue without
the user's decision; otherwise offer non-blocking `Choices`.

## Paths and source

- Tool `path` arguments are context-relative, with no leading slash.
- Workspace source paths are root-relative: `packages/`, `panels/`, `workers/`,
  `skills/`, `apps/`, `extensions/`, `meta/`. Never use host checkout paths.
- Use `fs.mktemp`/`fs.mkdtemp` for disposable state, and clean it up.

Read [Vibestudio VCS](../vibestudio-vcs/SKILL.md) before changing managed
source. Build and test the working state you will commit, commit the complete
local chain, and publish explicitly.

## Browser and credential safety

For browser automation, use `handle.cdp.session()` and its stable,
generation-fenced Playwright-style page. Never install a separate Playwright
package. Open a protocol-level CDP client only when you need one, and close the
session when the workflow ends.

For authenticated HTTP, call the host-mediated credential operation directly.
Never expose credential material or invent wildcard permissions. See [API
integrations](../api-integrations/SKILL.md) for setup and egress rules.

## Completion rules

- Keep eval results small; store large reports or handles in scope or files.
- Bind temporary panels with `await using panel = await openPanel(...)`: the
  panel and its subtree are archived when the cell exits, even on failure. In
  `finally`, close temporary CDP clients, workers, and other resources. Keep
  either only when the user asked to keep it.
- Let protected operations go through their normal approval flow. Do not add
  preflight calls, retries, or alternate transports to avoid approval.
- Probe optional packages separately so one failed import does not hide
  otherwise useful results.
