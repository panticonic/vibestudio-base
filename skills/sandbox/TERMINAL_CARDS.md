# Cards in the terminal chat

People read a conversation in the browser chat panel (the default) or in the
terminal chat. A message the person sends from the terminal ends with a note
saying so, and each chat client names its kind where it offers `inline_ui` and
in `list_addressees`. Messages persist, so either client may open them later:
write for the browser and let the terminal draw what it can.

The terminal chat draws the same content in text cells: an MDX message, and an
`inline_ui` component, become a live Ink tree in the transcript. The person
clicks a control, or selects the message (Ctrl-↑) and presses Enter to use the
card; Tab moves through its controls and Esc leaves it. The code runs in the
terminal chat's own process with its authority, as panel code runs in the
panel.

## What carries over

`inline_ui` takes the same arguments everywhere (`code` or `path`, `imports`,
`props`, `id`) and the component receives the same props:
`{ props, chat, scope, scopes, inlineUi }`.

- `chat` is the panel's implementation: `send`, `publish`, `callMethod`,
  `rpc`, custom messages. `focusMessage` selects the message in the
  transcript.
- `scope`/`scopes` persist in the terminal session's state.
- `@workspace/runtime` is the terminal's workspace runtime: `fs`, `gad`,
  `callMain`, `workers`, `openExternal` (approval-gated, on the person's
  machine), and `openPanel`, which opens the panel in the person's desktop
  panel tree.
- `path` sources, their relative imports, and `imports` build as in the
  panel.

`@radix-ui/themes`, `@workspace/react` and `@radix-ui/react-icons` resolve to
`@workspace/terminal-ui`, a kit with the same names and props:

- Layout and text: `Flex`, `Box`, `Grid`, `Card`, `Section`, `Separator`,
  `Text`, `Heading`, `Code`, `Kbd`, `Link` (a terminal hyperlink), `Badge`,
  `Blockquote`, `Callout`, `Table`, `DataList`, `Progress`, `Spinner`.
- Controls: `Button`, `IconButton`, `Checkbox`, `Switch`, `RadioGroup`,
  `CheckboxGroup`, `RadioCards`, `CheckboxCards`, `SegmentedControl`,
  `Select`, `TextField`, `TextArea`, `Slider`, `Tabs`.
- Response components: `Choices`, `ActionButton`, `Checklist`, `Stats`,
  `Compare`, `Timeline`, `Calculator`, and `Chart` (bars, sparklines and share
  bars in text). `useAction` and `OpenLinkButtons` work as in the panel.
- HTML elements map to the kit: `div`/`section` are columns (a `style` with
  `display: "flex"` keeps its direction and gap), `span` is text, `button`,
  `input`, `select` and `textarea` are controls, `a` is a link.

What the terminal cannot draw degrades: `PlaceMap` lists its places as map
links, `Image`/`Video` become a titled link, and `Diagram`/`Mermaid` (and
` ```mermaid ` fences) show their source. CSS other than flex layout,
`className`, `svg` and `canvas` are ignored or shown as a placeholder.
Tooltips, popovers and dialogs show their trigger only.

## Terminal-only cards

`ink` and `@workspace/terminal-ui` can be imported directly for a card meant
only for the terminal (for example one that reads keys with Ink's `useInput`).
A browser panel cannot resolve them, so such a card fails there: use them only
when the conversation is a terminal one.

## Rules

- Keep a card narrow (it may get 40 columns) and short; it is part of a
  scrolling transcript.
- A compile error comes back as the `inline_ui` result; a render failure comes
  back as a ui-feedback note naming the inline UI id, as from the panel.
