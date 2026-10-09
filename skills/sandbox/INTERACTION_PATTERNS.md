# Interaction Patterns

Pick the interaction that gives the user the most direct control over the
outcome for the least effort. Often that is a visual or interactive answer, and
the user does not have to ask for one.

## Use MDX response components

Use response components in your message (`Chart`, `Compare`, `PlaceMap`,
`Timeline`, `Checklist`, `Calculator`, `Stats`, `Choices`, `ActionButton`)
whenever data, options, places, steps, or what-if math are clearer shown than
described. If none fits, define a one-off component in the message, with its
own state if needed, instead of falling back to prose. When the next step is one
of a few directions, end with `Choices` or `ActionButton`s; the selection comes
back as a message with a structured `interaction`. See
[visualize](../visualize/SKILL.md).

## Use `eval`

Use `eval` for deterministic runtime work that needs no user choice:

- Read workspace state.
- Run a typecheck or test.
- Create a project after the user has approved its shape.
- Verify a credential or API response.

## Use `ask_user` and `feedback_form`

Block only when you cannot continue without the answer. Use `ask_user` for one
question and `feedback_form` for several related inputs in one form:

- Pick one option from a list you must act on.
- Supply a few settings needed before work can start.
- Enter a short label or numeric setting.

If the conversation can continue without the answer, offer `Choices` instead.

Do not chain several feedback forms into one setup flow; if you already know the
next question, put it in the same form. Do not ask about implementation details
(credential formats, protocol variants, permission names, storage modes, browser
mechanics) when a recommended default can be derived from the user's goal.

## Use `inline_ui`

Use `inline_ui` for a self-contained workflow whose component can call the
trusted runtime or skill helpers itself:

- Provider and OAuth setup.
- Browser/profile/data import.
- Checklists with deep links.
- Progress, verification, retry, and completion states.

A setup surface should:

- ask about outcomes in plain language, not about implementation;
- preselect the safest useful default;
- keep related choices, explanations, links, progress, and retry together;
- show advanced controls only when they are needed;
- offer one action button per place an operation can happen (for example
  internal or external browser) instead of asking a separate question;
- call trusted helpers directly from its buttons;
- show status, errors, retry, and success in the component.

Do not send setup choices back to the agent just so it can assemble a function
call from them.

Put direct link buttons in the UI. `OpenLinkButtons` from `@workspace/react`
renders the internal-panel and system-browser buttons, tracks each one's
pending state and failure, and keeps the other enabled:

```tsx
import { Flex, Text } from "@radix-ui/themes";
import { OpenLinkButtons } from "@workspace/react";

export default function SetupStep() {
  return (
    <Flex
      direction="column"
      gap="3"
      p="2"
      style={{ width: "100%", minWidth: 0 }}
    >
      <Text size="2" weight="bold">
        Open the credentials page
      </Text>
      <OpenLinkButtons url="https://console.cloud.google.com/apis/credentials" />
    </Flex>
  );
}
```

For any other trusted helper, give each control its own `useAction` from
`@workspace/react`. `run()` never rejects; it reports `pending`, `status`
(`idle`, `pending`, `done`, `failed`), and the failure `error` for that control
only.

## Use `feedback_custom`

Use `feedback_custom` only when the agent needs a returned decision to choose
its next operation and the component cannot perform that operation itself. For
example:

- selecting one of several fundamentally different plans the agent must write;
- approving a generated proposal before the agent changes workspace files;
- supplying structured requirements that feed later reasoning.

If every result maps directly to an existing helper call, use `inline_ui` and
make that call in the component.

## Use `load_action_bar`

Use `load_action_bar` for compact controls or status that should stay visible
above the chat history in the current panel:

- Current workflow status.
- Pinned next actions.
- Small control strips for a running task.
- A file-backed UI the agent can edit and reload.

`load_action_bar` takes inline TSX `code`, or a context-relative TSX file `path`
read from the current panel's filesystem context; inline code persists across
panel reloads without a file of your own. It affects only that panel, not other
panels on the same channel. Keep it compact; use `inline_ui` for larger
dashboards or results that belong in the transcript.

Under a workspace repo namespace such as `panels/`, use a repo-shaped path like
`panels/action-bar-review/index.tsx`. File-oriented APIs also accept the
shorthand `panels/action-bar-review.tsx`, expand it to
`panels/action-bar-review/action-bar-review.tsx`, and report the expanded path.

## Browser Opens

- Internal browser panels: `openPanel(url, { focus: true })`
- System browser: `openExternal(url)`
- OAuth authorize URLs: `openExternal(url, { expectedRedirectUri })`

Use `OpenLinkButtons` for these, or run the helper through `useAction` so the
pending and failure state belong to that action only and other controls stay
enabled. A pending approval prompt is a normal step in the workflow and must
not block the component or the panel tree.

`openExternal` requires approval. Do not invent provider-specific ways to open
a browser.
