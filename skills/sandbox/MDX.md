# MDX Messages

Use MDX in assistant messages whenever a visual or interactive answer is
clearer than plain Markdown: charts, comparisons, maps, timelines, checklists,
calculators, and follow-up choices. MDX props accept JavaScript expressions, so
response components can take data arrays and compute functions. Use
`inline_ui`, `load_action_bar`, or `feedback_custom` when the UI needs its own
state across turns, runtime calls, or workflow logic.

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
next-step prompts where the agent can continue from a normal chat message.

```mdx
<Flex gap="2" wrap="wrap">
  <ActionButton message="Show me the browser import workflow">
    Browser import
  </ActionButton>
  <ActionButton message="Help me build a panel">
    Build a panel
  </ActionButton>
</Flex>
```

Do not put arbitrary `onClick` handlers in MDX messages. If the action needs
runtime code, provider setup, browser opens, OAuth, persistence, or error
handling, render `inline_ui` or `feedback_custom` instead.
If the controls or status should stay pinned above the current chat history,
use `load_action_bar` with a TSX file.

## Callouts

Use callouts for short status, caveats, or setup notes.

```mdx
<Callout.Root color="blue">
  <Callout.Icon><Icons.InfoCircledIcon /></Callout.Icon>
  <Callout.Text>
    I found an existing Google OAuth client. You can reuse it or create a new one.
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

Good MDX uses:

- Charts, key figures, comparisons, maps, and timelines
- Calculators for splits, budgets, loans, and other what-if math
- Checklists and step-by-step tasks
- Follow-up `Choices` and next-step `ActionButton`s
- Summaries with badges, callouts, tabs, and tables

If the message's MDX fails to compile or render, it falls back to plain text
and you receive a ui-feedback note on your next turn. Repair it in your next
message.

Use `inline_ui`, `load_action_bar`, or `feedback_custom` instead for:

- Setup workflows with links and completion buttons
- Browser/profile import choices
- OAuth provider setup
- Dashboards, tables with row actions, or components the user may return to
- Anything that needs component state or runtime API calls

Prefer `load_action_bar` specifically for compact controls or status that
should stay visible at the top of the current chat panel while the conversation
continues.

## Images and videos

Use registered media components rather than raw HTML. Bare `<iframe>` and
`<video>` markup is not a supported chat authoring contract. Rich components
render when a message completes; never depend on partially streamed JSX.

```mdx
<Video url="https://youtu.be/Pb6C4ORBOOI" title="Introduction to Vibestudio" />
<Image
  src="https://example.com/diagram.png"
  alt="The three stages of the workflow"
/>
```

`Video` accepts YouTube watch, short, shorts, live, and embed URLs, including
start times. It embeds the privacy-enhanced player immediately, never
starts playback automatically, and always offers a watch link. Ordinary HTTPS
or panel-relative video URLs use native controls. Optional `poster`,
`caption`, `captionsUrl` (WebVTT), and `captionsLanguage` describe owned videos.
The media server must support the formats and seeking your clients require.
Videos with caption tracks use anonymous CORS; externally hosted video and VTT
responses must allow the panel origin. Caption-load failures remain visible.
Neither browser URLs nor panel-relative URLs name a server filesystem path.

`Image` accepts exactly one of `src` or `assetId`, plus `alt`, optional `caption`
and `filename`. Images appear immediately with an accessible enlarge dialog;
asset images use authenticated reads and support download. Markdown images use
this same renderer. External images retain an open-original link.

For a generated image, prefer the existing `notify` tool's `images` argument:

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

This publishes and retains the asset for conversation history without requiring
a file, base64 in model output, or a persisted Blob URL. File `attachments`
remain appropriate for screenshots and existing image files. Do not forget a
generation job before transferring its asset ownership. A hand-authored
`<Image assetId="..." />` also requires the author to retain the asset; plain JSX
is presentation, not an ownership transfer. Showing an image in chat does not
supply it to a model; use `read` or image-tool references for model inspection.

Authored TSX can import these same `Image` and `Video` components from
`@workspace/react`, including inline UI and action bars. MDX is for declarative
presentation; workflow logic belongs in authored UI.

### Media in the action bar

Use the same media components in a TSX action bar when a persistent player belongs
beside the current controls. For example, create a workspace source file:

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

Then call `load_action_bar({id:"introduction",path:"path/to/Introduction.tsx",maxHeight:360})`.
Unchanged message content preserves player state when chat action callbacks
change. Changing the media source or replacing its content retires playback.
The action bar has a bounded, scrollable height and its next revision replaces
the current player, retiring playback. Use a chat message when the media should
remain in conversation history; use the action bar when it accompanies an
ongoing task. Neither surface autoplays. Keep titles and external playback links
so users can identify media and recover from provider playback restrictions.

YouTube playback can be disabled by the video owner or blocked by the client
network. Keep the watch link available even while the player is mounted.
The player uses an origin-only cross-origin referrer because YouTube requires
[embedded player client identification](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity);
changing it to `no-referrer` can cause playback error 153.

### Owned video assets

For a small video shipped with authored UI, import the asset so the build owns
its URL; a workspace filesystem path in a message is not a playback URL:

```tsx
import { Video } from "@workspace/react";
import intro from "./assets/intro.mp4";
import captions from "./assets/intro.vtt";
export default function Introduction() {
  return <Video url={intro} captionsUrl={captions} title="Introduction" />;
}
```

Bundled media URLs and temporary Blob URLs are supported. Keep originals in
semantic source and use supported browser codecs (MP4 or WebM); local file URLs
are not shared with other devices. Bundled assets add to build/download size.
For larger videos, use an HTTPS media host with byte-range seeking or YouTube:
owned hosting gives control over captions, updates, access, and availability,
while YouTube supplies streaming and captions but adds a third-party connection
and provider playback restrictions. Never paste base64 video into model output.
