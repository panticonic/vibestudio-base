# Cards in the terminal chat

The terminal chat draws the same interactive content as a chat panel, in text
cells: an MDX message, and an `inline_ui` component, become a live Ink tree in
the transcript. The person clicks a control or selects the message
(Ctrl-↑), presses Enter to use the card, Tab through its controls, and Esc to
leave it. The code runs in the terminal chat's own process, as it runs in the
panel's realm.

## Write once, draw everywhere

`@radix-ui/themes`, `@workspace/react` and `@radix-ui/react-icons` resolve in
the terminal to `@workspace/terminal-ui`, a kit with the same component names
and props. A card written against them draws in both clients, so prefer them
when the conversation may be open in a panel too. Import `ink` or
`@workspace/terminal-ui` directly only for a terminal-only card: a panel cannot
resolve them.

What draws:

- Layout: `Flex`, `Box`, `Grid`, `Card`, `Section`, `Separator` (`gap`, `p`,
  `direction`, `align`, `justify` map to cells).
- Text: `Text`, `Heading`, `Strong`, `Em`, `Code`, `Kbd`, `Quote`, `Link`
  (a terminal hyperlink), `Badge`, `Blockquote`, `Callout`.
- Data: `Table`, `DataList`, `Progress`, `Spinner`, `Avatar`.
- Controls: `Button`, `IconButton`, `Checkbox`, `Switch`, `RadioGroup`,
  `CheckboxGroup`, `RadioCards`, `CheckboxCards`, `SegmentedControl`,
  `Select`, `TextField`, `TextArea`, `Slider`, `Tabs`.
- Response components: `Choices`, `ActionButton`, `Checklist`, `Stats`,
  `Compare`, `Timeline`. `Choices` and `ActionButton` answer through the same
  transcript protocol as in the panel.
- Markdown in MDX: paragraphs, headings, lists, tables, code, quotes, links.

`Chart`, `PlaceMap`, `Calculator`, `Image`, `Video`, `Diagram` and `Mermaid`
cannot be drawn and show as a one-line placeholder naming the desktop app.
Tooltips, popovers and dialogs show their trigger only.

## Rules

- Text cells, not pixels: `style`, `className`, CSS and HTML elements do
  nothing. Use the components' props.
- Keep a card narrow (it may get 40 columns) and short; it is part of a
  scrolling transcript.
- An `inline_ui` component receives `{ props, chat, inlineUi }`; there is no
  `scope`, `useAction` or runtime client. `chat.send(text)` posts as the
  person; `chat.publish(type, payload)` publishes an event.
- `inline_ui` in the terminal takes `code` only (no `path`, no `imports`).
- A compile error comes back as the method's result; a render failure comes
  back as a ui-feedback note naming the inline UI id, as from the panel.
