# Action Bar

`load_action_bar` renders compact UI at the top of the current chat panel,
below the chat header and above the history. Use it for small workflow
controls, current status, pinned next actions, and short-lived command
palettes.

The action bar belongs to the panel that exposes the tool. Other panels may use
different filesystem contexts and do not see it. Loading or clearing a bar does
not write a visible chat message, but it does publish a typed UI event, so the
transcript and the agent can see that it happened.

## Source

Pass the component either inline as `code` or as a context-relative TSX file
`path`. Either way it default-exports a React component:

```tsx
export default function ActionBar({ props = {}, chat, scope, scopes }) {
  // ...
}
```

Like inline UI, the component receives `{ props, chat, scope, scopes }`.
`scope` here is the panel's browser-local scope (see
[INLINE_UI.md](INLINE_UI.md#panel-scope)), not the eval REPL scope, which lives
server-side in the agent's `EvalDO`. Reach runtime services with
`chat.rpc.call(...)`.

For a temporary bar, pass `code`. The panel writes it to a scratch file it owns,
one per panel, and keeps that path in its state, so the bar survives panel
reloads. Do not create, track, or delete a file yourself; loading new `code`
replaces the panel's file, and `clear` removes the bar.

For an action bar that belongs with the workspace source, or one that uses
static relative imports of local helper files, write a checked-in file and pass
its `path`. Inside a workspace repo namespace such as `panels/`, use a
repo-shaped path, for example `panels/action-bar-review/index.tsx`.
File-oriented APIs also accept the shorthand `panels/action-bar-review.tsx` and
return its expansion, `panels/action-bar-review/action-bar-review.tsx`.

Action bars can call agent methods by handle without looking up a participant
id:

```tsx
await chat.callMethodByHandle("gmail", "checkNow", {});
const compose = await chat.callMethodByHandle("@gmail", "compose", {
  to: "a@example.com",
});
```

`chat.callMethodByHandle()` returns the provider payload.
`chat.callMethodResultByHandle()` returns the full invocation envelope, for
when you need metadata such as attachments or content type.

Imports work as in `inline_ui`: `react`, `@radix-ui/themes`,
`@radix-ui/react-icons`, and the workspace/runtime modules preloaded in the
panel; use `imports` to pin package versions. A `path` source also supports
static relative imports of local helpers and components, and infers bare
package imports from the nearest `package.json` when possible.
Package-local aliases from `package.json` `imports` and simple `tsconfig.json`
paths are supported.

Keep the component compact. The default maximum height is 180px (`maxHeight`
is clamped to 64–360px). Overflow scrolls, and a resize handle appears when
content reaches the cap. For file-backed action bars, resizing updates the
panel's `actionBarMaxHeight` state arg.

## Load Or Replace

```ts
load_action_bar({
  code: `export default function ActionBar() {
    return <div>Temporary controls</div>;
  }`,
});

load_action_bar({
  path: "panels/action-bar-review/index.tsx",
  props: { mode: "review" },
  maxHeight: 220,
});
```

Pass exactly one of `code` or `path`. The panel compiles the source, reading a
`path` from its current filesystem context, and renders it at the top of the
chat. Calling `load_action_bar` again replaces the
panel's previous action bar.

A compile failure (syntax error, unresolved import) comes back as an error
result and leaves the current bar unchanged. Render-time and props failures
arrive as ui-feedback notes: a note starts a repair turn if you are idle, or
follows your current turn. Fix the source and call `load_action_bar` again.

## Clear

```ts
load_action_bar({ clear: true });
```

## Initial Panel State

A chat panel can open with an action bar set through state args:

```ts
{
  actionBarFile: "panels/action-bar-review/index.tsx",
  actionBarProps: { mode: "review" }
}
```

Loading or clearing an action bar records a typed `ui.action_bar.updated` event
in the PubSub channel log. It is not a chat bubble, but the panel and agent read
it as part of the transcript, so do not add separate hidden context notes about
action bars.
