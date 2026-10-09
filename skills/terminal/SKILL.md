---
name: terminal
description: Run bounded local commands from an agent via the installed shell extension; use literal argv by default, shell text only for intentional shell syntax.
---

# Terminal commands

Use the terminal when the task requires an actual operating-system process or
command behavior. For programmatic workspace or scratch filesystem work, such
as creating, listing, moving, or removing a temporary tree, use the scoped
`@workspace/runtime` filesystem API in eval. It operates on the current context
and needs no shell permission.

Use the installed `shell` extension. For a normal command, use argv mode so
arguments are passed literally:

```ts
import { extensions } from "@workspace/runtime";

const result = await extensions.invoke("shell", "exec", [
  {
    intent: {
      kind: "argv",
      executable: "/usr/bin/printf",
      args: ["hello"],
    },
    timeoutMs: 5_000,
    maxOutputBytes: 64 * 1024,
  },
]);
```

Run it with `eval`. For multi-file workflows, put the code in a file relative
to the context and eval that file. The result has `exitCode`, `stdout`,
`stderr`, and `durationMs`.

Use shell-text mode only when the request needs pipes, redirections, globbing,
or other shell syntax. Don't rewrite an argv command as shell text for
convenience. Don't read the shell extension's source to learn its API;
`docs_search`/`docs_open` and this skill document it.

Permissions work as for any other operation. Call the operation once; if it
needs approval, the invocation suspends and resumes after the user decides. A
structured denial is final unless its remediation names a specific state change
to make first.

Keep output bounded and report exit status, relevant stdout/stderr, and whether
it timed out or was truncated.
