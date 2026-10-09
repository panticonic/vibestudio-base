# Inline UI

Inline UI puts persistent, rich components in the chat transcript. Use it also
for self-contained workflows whose controls can call trusted helpers directly.

## When To Use It

Use a UI instead of plain text whenever it serves the user better; the user does
not need to ask. Choose inline UI for a surface that refreshes under a stable id,
loads live data, calls workspace services or runtime APIs, or that the user will
come back to:

- Tools the user operates: calculators backed by workspace data, explorers,
  filters, and editors.
- Dashboards and live status.
- Multiple steps the user can complete independently.
- Links or resources the user may open inside Vibestudio or externally.
- Progress, status, or retry states.
- Tables with row actions and choices that trigger operations.

For presentation and local interaction (charts, comparisons, maps, timelines,
calculators, follow-up choices, one-off widgets with their own state), write MDX
in your message instead, and define a component there when the catalog has none.
See [visualize](../visualize/SKILL.md).

Build with the response components from `@workspace/react` (`Chart`, `Stats`,
`Compare`, `Timeline`, `Checklist`, `PlaceMap`, `Choices`, `Calculator`,
`ActionButton`, `Image`, `Video`) before writing layouts by hand; see
[COMPONENTS.md](../visualize/COMPONENTS.md).

A compile failure (syntax error, unresolved import) comes back as an error
result with the compiler message, and no card is published. Render-time and
props failures arrive as a ui-feedback note naming the inline UI id and the
error. The note starts a repair turn if you are idle, or follows your current
turn; failures in what you publish during a repair turn are reported only at
your next turn. Fix the source and render again with the same `id`.

For provider setup, OAuth, imports, and similar workflows, prefer `inline_ui`
when the component can perform the operation itself. Keep browser actions,
trusted prompts, progress, verification, errors, and retry in the component. Do
not send selections back to the agent just so it can build the helper call. Use
`feedback_custom` only when the agent needs the decision for its later
reasoning.

Pass raw TSX as `code`, or put the component in a context-relative file and call
`inline_ui({ path: ".tmp/ui/review.tsx", props: {...} })`. Components
loaded from a file support static relative imports, and bare package imports
are inferred from the nearest `package.json` when possible. Use `imports` to pin
package versions. Package-local aliases from `package.json` `imports` and simple
`tsconfig.json` paths are supported.

Pass a stable `id` when the UI is one evolving surface rather than a new
historical item:

```ts
inline_ui({
  id: "setup-overview",
  path: "skills/onboarding/SetupHub.tsx",
  props: overview,
});
```

A later `inline_ui` call from the same participant with that id replaces the
card and updates its render time, which moves it to the end of the transcript.
Components receive `inlineUi: { id, renderedAt }`; use `renderedAt` as an effect
dependency when a rerender should refresh data. Omit `id` to keep each render as
a separate historical card. The channel event stores `source` and `props`, not
the component's React state.

Inline UI is stored as a typed `ui.inline_rendered` event in the PubSub channel
log. Do not imitate it with `chat.publish("message", { contentType:
"inline_ui" })`; use the `inline_ui` tool so the transcript, replay, and agent
state all see the same event.

## Component Rules

- Components must `export default`.
- Use an unframed root such as `<Flex direction="column" gap="3" p="2">`.
- Do not wrap the whole component in a top-level card; the host already frames
  it.
- Use response components from `@workspace/react`, Radix primitives from
  `@radix-ui/themes`, and icons from `@radix-ui/react-icons`.
- The component runs in the hosting panel's realm and uses that realm's React
  and Radix Theme. If it lives in a skill or package that declares manifest
  dependencies, list `react` and `@radix-ui/themes` under `peerDependencies`,
  not `dependencies`. Listing them as dependencies bundles a second copy into
  the guest, and two copies of React in one realm cause hook errors with no
  obvious cause or Radix components rendering outside the host's Theme. See
  [external dependency
  resolution](../workspace-dev/DEPENDENCIES.md#own-it-or-let-the-realm-provide-it).
- Design for the card's width, not the browser viewport. Panel splits can be
  narrow on a wide desktop, so do not use Radix breakpoint objects such as
  `columns={{ initial: "1", sm: "2" }}` for the main layout.
  Prefer an intrinsic grid such as
  `style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" }}`.
- Give root layouts `style={{ width: "100%", minWidth: 0 }}`, wrap action rows,
  and render explanatory text as a block (`as="div"` or `as="p"`). Controls and
  prose must remain usable at a 320px card width without horizontal scrolling.
- Render links with `<OpenLinkButtons url={url} />` from `@workspace/react`:
  an internal browser panel (`openPanel(url, { focus: true })`) and the system
  browser (`openExternal(url)`, which requires approval). For OAuth authorize
  URLs pass `expectedRedirectUri`.
- Event handlers may call imported trusted skill/runtime helpers directly. Run
  each through its own `useAction(helper)` from `@workspace/react`: `run()`
  never rejects, and `pending`/`error` belong to that action only, so a pending
  approval prompt or panel boot does not block other controls.
- Show pending, failure, retry, and verified states in the component.
- Collect secrets only through host credential prompts, never through React
  inputs or component state.

## Panel Scope

Components receive `{ props, chat, scope, scopes, inlineUi }`. Serializable
values in `scope` persist in the panel's browser `localStorage`; large values
may spill into the workspace blob store. Inline UI, feedback, and the action bar
in the same panel share this scope. Use it for local UI state across reloads.
It is not shared across the channel, so when other panels or devices must see a
change, persist it in inline UI props instead.

## Live Dashboard Pattern

For status that should stay current without filling the transcript, use one
file-backed inline UI with a stable id. The component loads its own data. The
agent renders it once and asks for a refresh by rendering the same id again:

```ts
inline_ui({
  id: "service-health",
  path: ".tmp/ui/ServiceHealth.tsx",
});
```

No `eval` or `client_eval` needs to fetch the data first. On a later call the
card moves to the end of the transcript and `inlineUi.renderedAt` changes, which
the component treats as a refresh signal. Also give it a refresh button so the
user does not need an agent turn.

Use `scope` as a display cache under a namespaced key: render from it
immediately, replace it after loading fresh data from the source service, and
call `scopes.save()`. Scope is panel-local and is not the source of truth; data
shared across panels or devices belongs in its service or in persisted channel
data. Never cache credentials, tokens, or sensitive topology.

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { readServiceHealth } from "./dashboard-data";

const CACHE_KEY = "serviceHealthDashboard";

export default function ServiceHealth({ scope, scopes, inlineUi }) {
  const cached = scope?.[CACHE_KEY];
  const [health, setHealth] = useState(cached?.health ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refreshRequest = useRef(0);

  const saveCache = useCallback(
    async (update) => {
      if (!scope) return;
      scope[CACHE_KEY] = { ...(scope[CACHE_KEY] ?? {}), ...update };
      await scopes?.save?.();
    },
    [scope, scopes],
  );

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    setLoading(true);
    setError(null);
    try {
      const next = await readServiceHealth();
      if (request !== refreshRequest.current) return;
      setHealth(next);
      await saveCache({ health: next });
    } catch (cause) {
      if (request === refreshRequest.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (request === refreshRequest.current) setLoading(false);
    }
  }, [saveCache]);

  useEffect(() => {
    void refresh();
  }, [inlineUi?.renderedAt, refresh]);

  return (
    <Flex
      direction="column"
      gap="3"
      p="2"
      style={{ width: "100%", minWidth: 0 }}
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Text weight="medium">Service health</Text>
        <Button size="1" variant="soft" disabled={loading} onClick={refresh}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </Flex>
      {/* Render health here; cached data remains visible while it refreshes. */}
      <Text size="2">{health.length} services checked</Text>
      {error && <Text color="red">{error} — retry when ready.</Text>}
    </Flex>
  );
}
```

Refresh automatically only data that is cheap, expected, and local to the
workspace. Put remote, expensive, optional, or permission-sensitive loading
behind a clearly labeled button, and say before the click what it will load and
why a network or approval request may appear. Show loading, failure, and retry
in the card. Guard overlapping refreshes with a request counter or
`AbortController` so a stale response cannot overwrite newer state.

## Workflow Link Pattern

```tsx
import { Flex, Text } from "@radix-ui/themes";
import { OpenLinkButtons } from "@workspace/react";

export default function LinkActions({ props = {} }) {
  const url = props.url ?? "https://console.cloud.google.com/apis/credentials";
  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      wrap="wrap"
      p="2"
      style={{ width: "100%", minWidth: 0 }}
    >
      <Text size="2" weight="medium">
        {props.label ?? "Open setup page"}
      </Text>
      <OpenLinkButtons url={url} />
    </Flex>
  );
}
```

## Checklist Pattern

Use a checklist when the user must complete steps in another website or app.
Keep each item short and put its links and buttons next to it, not in a
paragraph below.

```tsx
import { useState } from "react";
import { Badge, Box, Checkbox, Flex, Text } from "@radix-ui/themes";
import { OpenLinkButtons } from "@workspace/react";

const steps = [
  [
    "project",
    "Create project",
    "https://console.cloud.google.com/projectcreate",
  ],
  [
    "credentials",
    "Open credentials",
    "https://console.cloud.google.com/apis/credentials",
  ],
];

export default function SetupChecklist() {
  const [done, setDone] = useState({});
  const count = steps.filter(([id]) => done[id]).length;

  return (
    <Flex direction="column" gap="3" p="2">
      <Flex justify="between" align="center">
        <Text size="2" weight="bold">
          Setup checklist
        </Text>
        <Badge variant="soft">
          {count}/{steps.length}
        </Badge>
      </Flex>
      {steps.map(([id, label, url]) => (
        <Box
          key={id}
          style={{
            border: "1px solid var(--gray-6)",
            borderRadius: 8,
            padding: 10,
          }}
        >
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Flex align="center" gap="2">
              <Checkbox
                checked={Boolean(done[id])}
                onCheckedChange={(checked) =>
                  setDone((prev) => ({ ...prev, [id]: checked === true }))
                }
              />
              <Text size="2">{label}</Text>
            </Flex>
            <OpenLinkButtons url={url} />
          </Flex>
        </Box>
      ))}
    </Flex>
  );
}
```
