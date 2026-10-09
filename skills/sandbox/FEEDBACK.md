# Feedback Forms

Feedback forms block the agent until the user responds. There are two
variants: `feedback_form` (schema-based) and `feedback_custom` (a React
component).

## feedback_form (Schema-Based)

A standard form built from typed fields, with no code.

Use it when you cannot continue without the answer: one decision or a set of
related inputs. For one quick question, `ask_user` is simpler. If the
conversation can continue without the answer, offer non-blocking `Choices`
instead (see [visualize](../visualize/SKILL.md)).

Do not split a known multi-step setup into several one-question forms. Provider
setup, permission selection, deep links, progress, retry, and explanatory
choices belong in a persistent `inline_ui` surface that calls its trusted
helpers directly.

### Parameters

| Param         | Type                              | Description                            |
| ------------- | --------------------------------- | -------------------------------------- |
| `title`       | string                            | Form title                             |
| `fields`      | FieldDefinition[]                 | Field definitions                      |
| `values`      | Record                            | Pre-populated values                   |
| `submitLabel` | string                            | Submit button text (default: "Submit") |
| `cancelLabel` | string                            | Cancel button text (default: "Cancel") |
| `severity`    | `"info" \| "warning" \| "danger"` | Visual severity                        |
| `hideSubmit`  | boolean                           | Hide submit button                     |
| `hideCancel`  | boolean                           | Hide cancel button                     |

### Field Types

| Type          | Extra Props                                                           | Description                                                    |
| ------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `string`      | —                                                                     | Text input                                                     |
| `number`      | —                                                                     | Number input                                                   |
| `boolean`     | —                                                                     | Checkbox                                                       |
| `select`      | `options: { value, label }[]`                                         | Dropdown                                                       |
| `slider`      | `min`, `max`                                                          | Range slider                                                   |
| `segmented`   | `options: { value, label }[]`                                         | Segmented control                                              |
| `multiSelect` | `options: { value, label }[]`                                         | Multiple checkboxes with Select all / Deselect all controls    |
| `textarea`    | —                                                                     | Multi-line text input                                          |
| `toggle`      | —                                                                     | Switch                                                         |
| `buttonGroup` | `buttons: { value, label, color?, description? }[]`, `submitOnSelect` | Row of answer buttons; with `submitOnSelect` one click answers |
| `readonly`    | —                                                                     | Display-only text                                              |
| `code`        | `language`, `maxHeight`                                               | Highlighted code or JSON (display)                             |
| `diff`        | `language`, `maxHeight`                                               | Diff view (display)                                            |

Choice fields (`select`, `segmented`, `multiSelect`) automatically add a
free-text "Other" choice; set `allowFreeText: false` on the field to remove it.
`buttonGroup` adds one only with `allowFreeText: true`. Customize the choice
with `freeTextLabel`, `freeTextPlaceholder`, and `freeTextKey`.

### Field Definition

```typescript
{
  key: string;       // required — field identifier
  label: string;     // required — display label
  type: string;      // required — field type
  default?: unknown; // default value
  required?: boolean;
  description?: string;
}
```

### Result

```typescript
{ type: "submit", value: { fieldKey: userValue, ... } }
// or
{ type: "cancel" }
```

### Example

```
feedback_form({
  title: "Deployment Config",
  fields: [
    { key: "env", label: "Environment", type: "select", options: [
      { value: "staging", label: "Staging" },
      { value: "production", label: "Production" },
    ], required: true },
    { key: "replicas", label: "Replicas", type: "slider", min: 1, max: 10, default: 3 },
    { key: "dryRun", label: "Dry run", type: "boolean", default: true },
  ],
  severity: "warning",
  submitLabel: "Deploy",
})
```

## feedback_custom (React Component)

For complex decisions that a schema-based form cannot express, when the agent
needs the structured result for its later reasoning.

Do not use it as the default surface for provider setup. When every control
maps to an existing runtime or skill helper, use `inline_ui`, call the helper
from the component, and show progress, errors, retry, and completion there.
Sending choices back to the agent only so it can assemble a function call adds
a needless round trip through the agent.

### Parameters

| Param     | Type                     | Description                                               |
| --------- | ------------------------ | --------------------------------------------------------- |
| `code`    | string                   | TSX source code. Provide either `code` or `path`          |
| `path`    | string                   | Context-relative TSX file to load instead of inline code  |
| `imports` | `Record<string, string>` | Explicit package versions, same semantics as eval imports |
| `title`   | string                   | Container header title                                    |

Feedback components loaded from a file support static relative imports from
the entry file, and bare package imports are inferred from the nearest
`package.json` when possible. Package-local aliases from `package.json`
`imports` and simple `tsconfig.json` paths are supported.

### Component Contract

The component receives `{ onSubmit, onCancel, onError, chat, scope, scopes }`
and must be the default export:

```tsx
export default function MyForm({ onSubmit, onCancel, onError, chat }) {
  // onSubmit(value) — return data to the agent and close the form
  // onCancel() — signal cancellation
  // onError(message) — signal error
  // chat — ChatSandboxValue (publish, callMethod, callMethodResult, rpc)
}
```

`scope` and `scopes` are the panel's browser-local scope, shared with inline UI
and the action bar (see [INLINE_UI.md](INLINE_UI.md#panel-scope)).

### Rendering Context

The component renders inside a container Card with a header, scroll area, and
resize handle. Do not wrap it in another top-level Card; use
`<Flex direction="column" gap="3" p="2">` or similar as the root.

### Error Handling

The host's error boundary catches render-time errors and synchronous throws in
event handlers. Errors from `chat.publish`, `chat.callMethod`, and
`chat.rpc.call` are caught too, even when awaited without try/catch.

**Wrap other awaited calls in `async` handlers (`fetch`, `fs.readFile`,
third-party libraries) in try/catch.** On failure, either call
`onError(message)` to report it to the agent, or show the error inline and leave
`onSubmit`/`onCancel` uncalled so the user can retry.

### Result

```typescript
{ type: "submit", value: { ... } }  // whatever was passed to onSubmit()
// or
{ type: "cancel" }
// or
{ type: "error", message: "..." }
```

### Example — Simple Form

```
feedback_custom({
  code: `
import { useState } from "react";
import { Button, Flex, Text, TextField } from "@radix-ui/themes";

export default function NameForm({ onSubmit, onCancel }) {
  const [name, setName] = useState("");
  return (
    <Flex direction="column" gap="3" p="2">
      <Text size="2" weight="bold">What is your name?</Text>
      <TextField.Root value={name} onChange={e => setName(e.target.value)} />
      <Flex gap="2" justify="end">
        <Button variant="soft" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit({ name })} disabled={!name}>Submit</Button>
      </Flex>
    </Flex>
  );
}`,
  title: "Name Input"
})
```

### Example — Structured input for agent reasoning

```
feedback_custom({
  code: `
import { useState } from "react";
import { Button, Flex, Text, TextArea } from "@radix-ui/themes";

export default function ReviewRequest({ onSubmit, onCancel }) {
  const [focus, setFocus] = useState("");
  return (
    <Flex direction="column" gap="3" p="2">
      <Text size="2" weight="bold">What should the review prioritize?</Text>
      <TextArea value={focus} onChange={(event) => setFocus(event.target.value)} />
      <Flex gap="2" justify="end">
        <Button variant="soft" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit({ focus })} disabled={!focus}>
          Start review
        </Button>
      </Flex>
    </Flex>
  );
}`,
  title: "Review Request"
})
```
