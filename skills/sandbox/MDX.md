# MDX Messages

Use MDX in assistant messages whenever a visual or interactive answer is
clearer than plain Markdown: charts, comparisons, maps, timelines, checklists,
calculators, follow-up choices, and small custom widgets. MDX props accept
JavaScript expressions. A message can import React and the UI packages and
define its own components, including stateful ones. When the UI must persist
and refresh under a stable id, call workspace services, or run a workflow, use
`inline_ui`, `load_action_bar`, or `feedback_custom` instead.

## Three tiers

1. **Response components** (`Chart`, `Compare`, `Calculator`, ...): the
   default whenever one fits.
2. **A one-off component defined in the message**: when no catalog component
   fits and the widget belongs to this answer, such as a stepper through a
   process, a color mixer, a small simulation, or a diagram that reacts to
   input.
3. **`inline_ui`**: for a surface that is refreshed under a stable id, calls
   workspace services or runtime APIs, or that the user comes back to.

## One-off components

Import what you need, export a component, and use it. Imports resolve as in
`inline_ui`: `react`, `@radix-ui/themes`, `@radix-ui/react-icons`,
`@workspace/react` (response components, `Image`, `Video`), and `@workspace/ui`
load instantly; other packages go through the build service and are slow.
Response and Radix tags also work without an import.

- Put `import` and `export` statements at the top level of the message, each
  starting its own block (a blank line before and after).
- Write plain JavaScript and JSX: no TypeScript type annotations, and no
  relative imports.

```mdx
Drag the slider to step through the cycle.

import { useState } from "react";
import { Flex, Slider, Text } from "@radix-ui/themes";

export function StrokeStepper() {
  const strokes = [
    ["Intake", "Piston moves down; the intake valve lets the air–fuel mix in."],
    ["Compression", "Both valves close; the piston squeezes the mixture."],
    ["Power", "The spark ignites it; expanding gas drives the piston down."],
    ["Exhaust", "The exhaust valve opens; the piston pushes burned gas out."],
  ];
  const [i, setI] = useState(0);
  return (
    <Flex direction="column" gap="2" style={{ width: "100%", minWidth: 0 }}>
      <Slider
        min={0}
        max={3}
        step={1}
        value={[i]}
        onValueChange={([v]) => setI(v)}
      />
      <Text weight="bold">
        {i + 1}. {strokes[i][0]}
      </Text>
      <Text as="p" size="2">
        {strokes[i][1]}
      </Text>
    </Flex>
  );
}

<StrokeStepper />
```

- Component state is local and resets when the message reloads. To return an
  answer to the agent, use `Choices` or `ActionButton`.
- Keep the component presentational: no workspace service calls, file writes,
  or network side effects. Those belong in `inline_ui`.
- Stay usable at a 320px width: `width: "100%"`, `minWidth: 0`, wrapping rows.
- Inline `<svg>` driven by state works well for small simulations and custom
  diagrams.

## Available Components

Normal chat messages support standard Markdown plus these components:

- Response components: `Chart`, `Stats`, `Compare`, `Timeline`, `Checklist`,
  `PlaceMap`, `Choices`, `Calculator`, `ActionButton` — see
  [COMPONENTS.md](../visualize/COMPONENTS.md)
- `Avatar`, `Badge`, `Blockquote`, `Box`, `Button`, `Callout`, `Card`, `Code`,
  `DataList`, `Flex`, `Grid`, `Heading`, `Inset`, `Link`, `Progress`,
  `Separator`, `Table`, `Tabs`, `Text`, `Tooltip`
- `Icons` from Radix icons, such as `Icons.CheckIcon`,
  `Icons.InfoCircledIcon`, `Icons.OpenInNewWindowIcon`
- `ActionButton` for simple follow-up actions
- `Image` and `Video` for media; see the contract below

## ActionButton

`ActionButton` sends a new user message when clicked. Use it for simple
next-step prompts that the agent can continue from as a normal chat message.

```mdx
<Flex gap="2" wrap="wrap">
  <ActionButton message="Show me the browser import workflow">
    Browser import
  </ActionButton>
  <ActionButton message="Help me build a panel">Build a panel</ActionButton>
</Flex>
```

Event handlers in a message's own components are fine for local interaction.
If an action needs workspace services, provider setup, browser opens, OAuth,
persistence, or error handling, render `inline_ui` or `feedback_custom`
instead. For controls or status pinned above the chat history, use
`load_action_bar` with TSX.

## Callouts

Use callouts for short status, caveats, or setup notes.

```mdx
<Callout.Root color="blue">
  <Callout.Icon>
    <Icons.InfoCircledIcon />
  </Callout.Icon>
  <Callout.Text>
    I found an existing Google OAuth client. You can reuse it or create a new
    one.
  </Callout.Text>
</Callout.Root>
```

## Links

Markdown links are clickable in Vibestudio panels.

- HTTPS links open browser panels.
- Workspace panel navigation should use `buildPanelLink` from
  `@workspace/runtime` inside panel code.
- Workflow UI should offer both `openPanel(url, { focus: true })` and
  approval-gated `openExternal(url)` when the user may need their normal browser
  profile.
- OAuth authorize URLs should use
  `openExternal(authorizeUrl, { expectedRedirectUri })`.

## When To Use MDX

Use MDX for:

- Charts, key figures, comparisons, maps, and timelines
- Calculators for splits, budgets, loans, and other what-if math
- Checklists and step-by-step tasks
- Follow-up `Choices` and next-step `ActionButton`s
- Summaries with badges, callouts, tabs, and tables
- One-off interactive widgets: steppers, simulations, mixers, explorers

If a message's MDX fails to compile or render, the message falls back to plain
text and you receive a ui-feedback note. The note starts a repair turn if you
are idle, or follows your current turn. Fix the MDX in your next message.
Failures in what you publish during a repair turn are reported only at your next
turn.

Use `inline_ui`, `load_action_bar`, or `feedback_custom` instead for:

- Setup workflows with links and completion buttons
- Browser/profile import choices
- OAuth provider setup
- Dashboards, tables with row actions, or components the user may return to
- Anything that calls workspace services or runtime APIs

Of these, use `load_action_bar` for compact controls or status that should stay
visible at the top of the current chat panel while the conversation continues.

## Images and videos

Use the media components, not raw HTML; bare `<iframe>` and `<video>` markup
is not supported in chat. Rich components render once the message completes, so
do not rely on partially streamed JSX.

```mdx
<Video url="https://youtu.be/Pb6C4ORBOOI" title="Introduction to Vibestudio" />
<Image
  src="https://example.com/diagram.png"
  alt="The three stages of the workflow"
/>
```

`Video` accepts YouTube watch, short, shorts, live, and embed URLs, including
start times. It embeds the privacy-enhanced player immediately, never autoplays,
and always shows a watch link. Other HTTPS or panel-relative video URLs play
with native controls. For your own videos, the optional `poster`, `caption`,
`captionsUrl` (WebVTT), and `captionsLanguage` props apply.

- The media server must support the formats and seeking your clients need.
- Videos with caption tracks load with anonymous CORS, so externally hosted
  video and VTT responses must allow the panel origin. Caption-load failures are
  shown to the user.
- Video URLs, whether absolute or panel-relative, are never server filesystem
  paths.

`Image` takes exactly one of `src` or `assetId`, plus `alt` and optional
`caption` and `filename`. Images appear immediately with an accessible enlarge
dialog. Asset images are read with authentication and can be downloaded;
external images keep a link to the original. Markdown images use the same
renderer.

To share a generated image, prefer the `notify` tool's `images` argument:

```json
{
  "content": "Here is the illustration.",
  "images": [
    {
      "assetId": "<ID returned by imagegen>",
      "alt": "A fox beside a river",
      "caption": "The opening scene"
    }
  ],
  "alert": "none"
}
```

This publishes the asset and retains it for the conversation history, with no
file, base64 in model output, or persisted Blob URL. Use file `attachments` for
screenshots and existing image files.

- Do not forget a generation job until its asset has another owner (the
  `notify` publication or an explicit retain).
- A hand-written `<Image assetId="..." />` only displays the asset; it does not
  retain it, so the author must retain the asset.
- Showing an image in chat does not give it to a model. For model inspection,
  use `read` or image-tool references.

Authored TSX, including inline UI and action bars, can import the same `Image`
and `Video` components from `@workspace/react`. Use MDX for declarative
presentation and authored UI for workflow logic.

### Media in the action bar

Use the same media components in a TSX action bar when a player should stay
next to the current controls. For example, pass this TSX as `code` (or keep it
in a workspace source file and pass its `path`):

```tsx
import { Video } from "@workspace/react";
export default function Introduction() {
  return (
    <Video
      url="https://www.youtube.com/watch?v=Pb6C4ORBOOI"
      title="Introduction to Vibestudio"
    />
  );
}
```

Then call `load_action_bar({ code, maxHeight: 360 })`.

Playback state survives as long as the message content is unchanged, even when
chat action callbacks change. Changing the media source or replacing the
content stops playback. The action bar has a bounded, scrollable height, and
loading its next revision replaces the player and stops playback.

Use a chat message when the media should stay in the conversation history; use
the action bar when it accompanies an ongoing task. Neither autoplays. Keep
titles and external playback links so users can identify the media and work
around provider playback restrictions.

The video owner can disable YouTube embedding, and the client network can block
it, so keep the watch link available even while the player is mounted. The
player sends an origin-only cross-origin referrer because YouTube requires
[embedded player client identification](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity);
changing it to `no-referrer` can cause playback error 153.

### Owned video assets

To ship a small video with authored UI, import it so the build produces its
URL. A workspace filesystem path in a message is not a playback URL:

```tsx
import { Video } from "@workspace/react";
import intro from "./assets/intro.mp4";
import captions from "./assets/intro.vtt";
export default function Introduction() {
  return <Video url={intro} captionsUrl={captions} title="Introduction" />;
}
```

Bundled media URLs and temporary Blob URLs work. Keep the originals in semantic
source and use codecs browsers support (MP4 or WebM). Local file URLs are not
available on other devices, and bundled assets increase build and download size.

For larger videos, use an HTTPS media host with byte-range seeking, or YouTube.
Your own host gives you control over captions, updates, access, and
availability. YouTube provides streaming and captions but adds a third-party
connection and its playback restrictions. Never paste base64 video into model
output.
