# Custom Message Types

Register a custom React renderer with a channel, then publish typed message
instances that use it. The channel stores the registry and the instances as
typed agentic events, so replay, fork, and pagination show the same view.

Use a custom message type when no built-in message shape fits (a weather card,
a build status badge, a sensor readout, a domain-specific decision tile) and
many instances of the same shape will be published and updated over time. For a
one-off React component in the transcript, use [`inline_ui`](INLINE_UI.md).

## Concepts

A custom message type has two halves:

1. A **registration** on the channel: a `typeId`, a display mode, and a source
   (file path or inline code) that compiles to a renderer module.
2. **Instances**: a `custom.started` event (with optional initial state) plus
   zero or more `custom.updated` events that fold into the rendered state.

The renderer module's `reduce` export decides how updates merge. Without one,
the last update wins.

### Module shape

The compiled module may export:

| Export    | Purpose                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default` | Required. React component receiving `{ messageId, typeId, state, expanded, displayMode, chat }`. Renders compact inline content when `expanded` is false and the full view when it is true. |
| `Pill`    | Optional. Component for the collapsed inline view (`expanded === false`). When present, it renders the bead and `default` renders only the expanded card. Same props as `default`.          |
| `reduce`  | Optional. `(state, update) => nextState`, folding `custom.updated` payloads. Without it, each update replaces the state. If it throws, the prior state is kept and folding continues.       |

### Schema validation

The registration carries `stateSchema` as a plain JSON Schema document, plus
`updateSchema` for types that export `reduce` (their updates are patches). Each
schema is enforced in two places:

- **When publishing**: an agent publishing through its `cards` handle
  (`CardManager` in `@workspace/agentic-do`) gets a typed `CardValidationError`
  for invalid state. It surfaces as a tool error the model can react to.
- **When rendering**: the panel validates the folded state before passing it to
  the component. On failure the card shows a compact validation callout instead
  of crashing the transcript, and publishes a `ui.feedback` event to the card
  owner so the agent learns about it.

The channel reducer never validates, so validation cannot affect replay.

### Display modes

| Mode       | Rendering                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `"inline"` | Bead inside the sender's message group with `expanded: false`. Click to expand the full card with `expanded: true`. |
| `"row"`    | Full chat row, like a normal message. Card renders the component with `expanded: true`.                             |

`displayMode` on the registration is the default. An instance can override it
with `displayMode` on `publishCustomMessage` / `custom.started`.

## From panel or worker code (PubSubClient)

Code with a `PubSubClient` (panels, workers, headless sessions via
`manager.client`) uses its typed helpers:

```typescript
import type { PubSubClient } from "@workspace/pubsub";

await client.registerMessageType({
  typeId: "weather",
  displayMode: "inline",
  source: {
    type: "file",
    path: "skills/sandbox/references/weather-message-renderer.tsx",
  },
  imports: { "@radix-ui/themes": "npm:^3.2.1" },
});

const { messageId } = await client.publishCustomMessage({
  typeId: "weather",
  initialState: { city: "San Francisco", tempF: 64, condition: "Cloudy" },
});

await client.updateCustomMessage(messageId, {
  tempF: 66,
  condition: "Clearing",
});

// Later, retire the type:
await client.clearMessageType("weather");
```

The `source` is either `{ type: "file", path }` or `{ type: "code", code }`
(inline TSX). `imports` accepts the same shape as `eval` / `inline_ui`
(`{ "@pkg": "npm:^1.2.3" }` or workspace refs).

File paths are **relative to the workspace root, with no `workspace/`
prefix**, as for action-bar files. The panel resolves them in its context,
whose root mirrors the workspace root (`skills/…`, `panels/…`, `packages/…`).
Use `skills/my-skill/renderer.tsx`; `workspace/skills/my-skill/renderer.tsx`
resolves to a nonexistent `<context>/workspace/…` and fails with ENOENT.

The file must exist in the panel context's projected working head. A file
added after the panel opened becomes visible only after the context is
reprojected or the panel is recreated; what happens to be on disk is not a
reliable indication of source state.

Clearing a type tombstones it at a sequence number. Registering it again
reactivates the `typeId` without bringing back cleared instances. Registry
merges are sequence-aware and idempotent, so pagination and out-of-order replay
still resolve to the latest write.

Lookup helpers:

```typescript
const all = await client.getMessageTypes();
const weather = await client.getMessageType("weather");
```

The complete renderer used above is
[`references/weather-message-renderer.tsx`](references/weather-message-renderer.tsx),
next to this guide.

## From sandbox code (eval / inline_ui / action_bar / feedback_custom)

The `chat` sandbox value has the same registry and instance helpers as a
`PubSubClient`. Register once, then publish and update instances:

```ts
const typeId = "weather";

// 1. Register the renderer (once per channel; safe to re-register — a fresh
//    registration bumps the seq and reloads the source).
await chat.registerMessageType({
  typeId,
  displayMode: "inline",
  source: {
    type: "file",
    path: "skills/sandbox/references/weather-message-renderer.tsx",
  },
  imports: { "@radix-ui/themes": "npm:^3.2.1" },
});

// 2. Publish and update instances.
const { messageId } = await chat.publishCustomMessage({
  typeId,
  initialState: { city: "San Francisco", tempF: 64, condition: "Cloudy" },
  displayMode: "inline",
});
await chat.updateCustomMessage(messageId, { tempF: 66, condition: "Clearing" });

// 3. Look up or retire the type.
const all = await chat.getMessageTypes();
const weather = await chat.getMessageType(typeId);
await chat.clearMessageType(typeId);
```

`registerMessageType` and `clearMessageType` are thin wrappers over the typed
`messageType.registered` / `messageType.cleared` agentic events. You can build
those events yourself with `chat.publish(AGENTIC_EVENT_PAYLOAD_KIND, event)`,
but prefer the helpers.

## Authoring the renderer module

The chat panel compiles the module with the same pipeline as `inline_ui`.
Imports follow the [eval import rules](EVAL.md#imports): workspace packages
resolve automatically, npm packages need `imports: { "pkg": "npm:^x.y.z" }` on
the registration, and modules loaded from a file infer bare imports from the
nearest `package.json`.

Relative imports work, so a renderer can span sibling files.
`import { fmt } from "./helpers.js"` resolves to `helpers.ts`/`.tsx` (the `.js`
extension maps to the TS source). `import type { Foo } from "./types.js"` is
erased and never fetched, so a types-only file does not need to exist at
runtime. Files imported for values must exist in the panel's context, like the
renderer itself.

```tsx
// skills/sandbox/references/weather-message-renderer.tsx
import { Badge, Card, Flex, Text } from "@radix-ui/themes";

interface WeatherState {
  city: string;
  tempF: number;
  condition: string;
}
type WeatherUpdate = Partial<WeatherState>;

export function reduce(
  state: WeatherState,
  update: WeatherUpdate,
): WeatherState {
  return { ...state, ...update };
}

export default function WeatherMessage({
  state,
  expanded,
}: {
  state: WeatherState;
  expanded: boolean;
}) {
  if (!expanded) {
    return (
      <Flex align="center" gap="1">
        <Text size="1" weight="medium">
          {state.city}
        </Text>
        <Text size="1" color="gray">
          {state.tempF}F
        </Text>
      </Flex>
    );
  }

  return (
    <Card>
      <Flex direction="column" gap="2">
        <Flex align="center" justify="between" gap="3">
          <Text size="3" weight="bold">
            {state.city}
          </Text>
          <Badge color="blue" variant="soft">
            {state.condition}
          </Badge>
        </Flex>
        <Text size="6" weight="bold">
          {state.tempF}F
        </Text>
      </Flex>
    </Card>
  );
}
```

Rules:

- `export default` is required; without it the card renders an error.
- Inline messages should render pill-sized content when `expanded` is false.
  The host tracks expansion and re-renders the same message as an expanded card
  when the user selects it.
- Clicking or pressing a key on a collapsed inline message expands it. Events
  from controls inside collapsed content bubble up and expand it too; call
  `event.stopPropagation()` in controls that should act on their own.
- Render purely from `state`; updates re-render through the reducer fold.
- The only injected handle is `chat`. To send events back to the channel, call
  `chat.publish` / `chat.callMethod` from event handlers.
- The module is recompiled when `updatedAtSeq` advances (on re-registration).
  Keep it pure so identical re-registrations produce the same output.

### State, not scope

Custom-message components do **not** receive `scope`, `scopes`, or `help`.
Those are eval bindings in the agent's server-side `EvalDO`. Therefore:

- **Data the card needs must live in the message `state`.** Put it in
  `initialState` and updates, and keep it small, because the channel stores
  every byte. The same `state` renders identically in every panel and on
  replay.
- To keep interaction state across reloads, publish a `custom.updated` event
  (folded by `reduce`). Do not keep it in component refs or local state.

## Reducer semantics

- Updates are applied in channel sequence order. The reducer must be
  deterministic and give the same result on every replay.
- Without a `reduce` export, each `custom.updated` payload replaces the whole
  state.
- `initialState` seeds the fold. With no updates and no reducer, it is the
  displayed state.

## Caveats

- Workspace source is built from the context's working head. If the module is
  in a managed workspace unit, edit it through the semantic adapter and follow
  [vibestudio-vcs](../vibestudio-vcs/SKILL.md) to commit and publish. Editing
  the projected files on disk does not change the source.
- Custom messages render only in panels. Headless sessions receive the events
  but render nothing.
- Do not reuse a `typeId` for an unrelated shape. The latest registration for a
  `typeId` wins, and old instances re-render through the new module.

## Operations & debugging

### Renderer load lifecycle

When a custom message arrives, the panel loads its type in these stages,
visible in the card's diagnostic view and as `[useMessageTypeRegistry]` console
traces:

| Stage                 | What is happening                                  | Stuck here means                                                              |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `fetching-definition` | `getMessageType(typeId)` from the channel registry | registration never happened, or the channel RPC is failing                    |
| `loading-source`      | `fs.readFile` of the registered source file        | bad path, or the file is missing from this context                            |
| `compiling`           | sandbox compile of the renderer module             | an import needs the build service (see lint below), or a compile-pipeline bug |

A type that fails any stage shows an error pill or card with a **Retry**
button. A stage that takes 30s or more publishes a `ui.feedback` event with
category `load_stalled` to the owning agent, so the agent learns its card never
rendered without the user having to report it.

### Self-containment rule (and lint)

Every **value** import in a renderer must come from a module the panel host
provides (`react`, `react/jsx-runtime`, `@radix-ui/themes`,
`@radix-ui/react-icons`, …), the registration's `imports` map, or a relative
file. Any other import goes through the build service on every compile, which
is slow at best and can misresolve and leave the card stuck. `import type` is
always fine because it is erased at compile time.

At registration time, run `lintRendererSource(code, { imports })` from
`@workspace/agentic-core` (re-exported by `@workspace/agentic-do`) and do not
register if it reports issues. The gmail agent's `installChannelUi` is the
reference implementation.

### Message-type doctor (test harness)

Agents that register renderers should run the doctor in their test suite. It
runs the same pipeline as the panel (registration event → channel reducer →
projection → lint → compile with the build service disabled) and reports issues
per stage:

```ts
// @vitest-environment jsdom
import {
  assertMessageTypesHealthy,
  installDoctorHostModules,
} from "@workspace/agentic-core";

installDoctorHostModules({
  react: await import("react"),
  "react/jsx-runtime": await import("react/jsx-runtime"),
  "react/jsx-dev-runtime": await import("react/jsx-dev-runtime"),
  "@radix-ui/themes": await import("@radix-ui/themes"),
  "@radix-ui/react-icons": await import("@radix-ui/react-icons"),
});
await assertMessageTypesHealthy(MY_MESSAGE_TYPES, {
  loadSourceFile: (p) => fs.readFile(path.join(REPO_ROOT, p), "utf8"),
});
```

Call the doctor from the package that defines the renderers. A type that fails
it would show up in users' panels as a stuck spinner or a build-service stall.

### Failure states, from the user's perspective

| State                  | UI                                                   | How it got there                                                                                                                        |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Owner-declared failure | red "failed" frame with the error message            | the agent called `card.fail({ message })` (protocol: `custom.updated` with `status: "failed"`); a later successful `update()` clears it |
| Invalid state          | amber validation callout                             | folded state failed the registered `stateSchema`; also publishes `ui.feedback` (`state_invalid`) to the owner                           |
| Render crash           | red error callout with report status                 | the component threw; publishes `ui.feedback` (`render_failed`) and shows whether the report reached the agent                           |
| Load stuck/failed      | diagnostic card with stage, elapsed, metadata, Retry | see lifecycle table above                                                                                                               |

### Inspecting a card

- **User**: every expanded card has **Copy details** (full JSON: payload,
  registry status, definition metadata) and an **Inspect** toggle that shows
  the metadata and the fold history: each `custom.updated` payload and the
  state it produced, so a reducer bug shows up as "state went wrong at seq N".
  Loading and error pills expand into the same diagnostic view when clicked.
- **Agent**: call the chat panel's `inspect_card` method with `{ messageId }`.
  It returns what Copy details shows, plus a list of known cards when the id is
  wrong. Call it like any other participant method; the panel advertises it
  with its other UI methods.

### Emission guarantees (CardManager)

- `cards.getOrCreate(channelId, typeId, naturalKey, state)` is persistent and
  idempotent: the same natural key returns the same card across agent restarts.
  Idempotency keys are deterministic (`custom:{agent}:{msg}:{seq}`), so a
  retried publish is deduplicated rather than applied twice.
- State, and updates for types with a reducer, are validated against the
  registered JSON Schemas **when published**. Failures throw
  `CardValidationError`, which surfaces as a tool error the model can react to.
  Unregistered types throw `CardTypeNotRegisteredError`.
- `ui.feedback` events for the agent (render failures, invalid state, expired
  method calls, load stalls) are deduplicated by `occurrenceKey` and delivered
  as a diagnostic note. A failure of output from an ordinary turn starts a
  repair turn when the agent is idle, or follows its current turn. Failures of
  what a repair turn publishes, and later failures of an already repaired turn,
  wait for the agent's next turn.
