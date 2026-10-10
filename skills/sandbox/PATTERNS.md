# Common Patterns

Recipes for common tasks using the sandbox.

## Store a Nested Immutable File Tree

`blobstore.putPathTree` takes full relative paths. A string is stored as UTF-8
text, bytes as-is, and `{ digest }` (such as a `putText` result) references a
blob that is already stored:

```ts
const root = await blobstore.putPathTree(
  {
    "docs/intro.txt": "Introduction",
    "assets/logo.png": pngBytes,
    "bin/run.sh": { digest: script.digest, mode: 33261 },
  },
  { root: true },
);
```

It returns the root's `{ treeHash, stateHash? }`. Readers such as
`readFileAtTree(root.treeHash, "docs/intro.txt")` accept the same paths.
`putTree` stores one directory node from single-component entry names when you
need that lower level.

## Build a Live Transcript Dashboard

For an inline status view that refreshes itself, caches its last display
state, and updates in place when the agent renders it again, use the
[Live Dashboard Pattern](INLINE_UI.md#live-dashboard-pattern). It also covers
manual refresh, protection against racing requests, and putting optional remote
discovery behind an explained user action.

## Recover From a Durable Object Schema Refusal

`DO_SCHEMA_INCOMPATIBLE` means the stored data does not match the current
schema; fix the schema design. Read the structured `errorData` rather than
parsing the message text, and do not store schema state in application data.

1. Do not migrate the store. The pre-release runtime supports only the current
   schema and rejects any other shape without changing it.
2. If the state is disposable, pass the resolved target to
   `workers.resetStorage(target, intent)`. The reset blocks new RPCs and
   verifies a backup before deleting anything.
3. List or restore that backup with `workers.listStorageBackups(target)` and
   `workers.restoreStorageBackup(target, operationId, intent)`.

`DO_MAINTENANCE_IN_PROGRESS` means the host is blocking RPCs for maintenance.
Wait for it to finish; do not route around it.

## Read a File and Display It

`fs` is injected into eval and scoped to the context. Do not import it.

```
eval({ code: `
  const content = await fs.readFile("src/index.ts", "utf-8");
  console.log(content);
  return content;
` })
```

## List Directory Contents

```
eval({ code: `
  const entries = await fs.readdir("src", { withFileTypes: true });
  for (const e of entries) {
    console.log(e.isDirectory() ? "dir:  " + e.name : "file: " + e.name);
  }
` })
```

## Search Files for a Pattern

```
eval({ code: `
  async function grep(dir, pattern, results = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = dir + "/" + entry.name;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist") {
          await grep(path, pattern, results);
        }
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const content = await fs.readFile(path, "utf-8");
        const lines = content.split("\\n");
        lines.forEach((line, i) => {
          if (line.includes(pattern)) results.push({ path, line: i + 1, text: line.trim() });
        });
      }
    }
    return results;
  }

  const matches = await grep("src", "TODO");
  console.log(matches);
  return matches;
`
})
```

## Use an npm Package (lodash)

```
eval({
  code: `
    import _ from "lodash";
    const data = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Charlie", age: 35 },
    ];
    console.log("Grouped by age > 28:", _.groupBy(data, d => d.age > 28 ? "senior" : "junior"));
    console.log("Sorted by age:", _.sortBy(data, "age").map(d => d.name));
  `,
  imports: { "lodash": "npm:^4.17.21" }
})
```

## Use an npm Package (date-fns)

```
eval({
  code: `
    import { format, addDays, differenceInDays } from "date-fns";
    const today = new Date();
    const nextWeek = addDays(today, 7);
    console.log("Today:", format(today, "yyyy-MM-dd"));
    console.log("Next week:", format(nextWeek, "yyyy-MM-dd"));
    console.log("Days between:", differenceInDays(nextWeek, today));
  `,
  imports: { "date-fns": "npm:^3.6.0" }
})
```

## Use a Scoped npm Package (@faker-js/faker)

```
eval({
  code: `
    import { faker } from "@faker-js/faker";
    for (let i = 0; i < 5; i++) {
      console.log(faker.person.fullName(), "-", faker.internet.email());
    }
  `,
  imports: { "@faker-js/faker": "npm:^9.0.0" }
})
```

## npm Packages in Inline UI

> **Defensive coding:** When an inline UI component uses `props`, default the parameter (`{ props = {}, chat }`) and guard property access (`props?.items ?? []`). For small datasets, constants in the component source are simpler and more portable than `props`.

`eval` runs server-side (in the `EvalDO`) and `inline_ui` compiles in the chat
panel. They have **separate module registries**: a package loaded in `eval` is
not available to `inline_ui`. To use a non-default npm package in a component,
put the component in a context-relative file and declare the dependency in the
nearest `package.json` (the panel infers imports for files it loads). For a
small piece of logic, inline it instead of adding the dependency.

Create `.tmp/ui/package.json` with the dependency before saving the component:

```json
{ "private": true, "dependencies": { "lodash": "^4.17.21" } }
```

```ts
// Component lives in a file whose nearest package.json lists "lodash";
// the panel resolves the import when it compiles the file.
inline_ui({
  path: ".tmp/ui/shuffler.tsx",
  props: { items: ["Apple", "Banana", "Cherry"] },
});
```

```tsx
// .tmp/ui/shuffler.tsx
import { useState } from "react";
import { Button, Flex, Text } from "@radix-ui/themes";
import _ from "lodash";

export default function Shuffler({ props = {} }) {
  const [items, setItems] = useState(props.items ?? []);
  return (
    <Flex direction="column" gap="2">
      <Button size="1" onClick={() => setItems(_.shuffle([...items]))}>
        Shuffle
      </Button>
      {items.map((item, i) => (
        <Text key={i} size="2">
          {item}
        </Text>
      ))}
    </Flex>
  );
}
```

For larger eval or UI code, write a context-relative file and pass it with the
tool's `path` parameter. Static relative imports from that file are resolved,
and bare package imports are inferred from the nearest `package.json` where
possible:

```ts
eval({ path: ".tmp/eval/audit.ts" });
inline_ui({ path: ".tmp/ui/audit-panel.tsx", props: { runId } });
feedback_custom({
  path: ".tmp/ui/confirm-audit.tsx",
  title: "Confirm audit",
});
```

## Call an API with a URL-bound credential

Store a URL-bound credential once, then send requests through the runtime
credential proxy.

`credentials.fetch(url, init, { credentialId })` returns a `Response`. It is
part of the portable runtime in `@workspace/runtime` and works from server-side
eval, panels, workers, and DOs. In eval, import `credentials` from
`@workspace/runtime` and use `credentials.fetch` for external requests that need
a stored credential:

```tsx
import { credentials } from "@workspace/runtime";

const credential = await credentials.store({
  label: "Notion",
  audience: [{ url: "https://api.notion.com", match: "origin" }],
  injection: {
    type: "header",
    name: "authorization",
    valueTemplate: "Bearer {token}",
  },
  material: { type: "bearer-token", token },
});

const response = await credentials.fetch(
  "https://api.notion.com/v1/search",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({ query: "meeting notes" }),
  },
  { credentialId: credential.id },
);
const results = await response.json();
```

This works with any configured provider; call
`await credentials.listStoredCredentials()` to see what is stored. See
[RUNTIME_API.md](RUNTIME_API.md) for the full runtime API.

## Protect a Custom Userland Resource

The portable runtime has no `approvals` namespace for ad hoc prompts. A
provider protects its resource declaratively:

1. Add a user-facing capability definition to the provider package's
   `vibestudio.authority.provides`.
2. Bind the receiving `@rpc` method to that unit-local capability with a
   literal `userland-capability` effect.
3. The host then derives the receiver resource and runs its normal capability
   acquisition flow before provider code executes.

Do not add your own prompt around filesystem, browser, credential, Git, panel,
or other host-mediated operations; those APIs already request their own host
capabilities. See the [capabilities skill](../capabilities/SKILL.md) for full
receiver-object and opaque-handle examples.

## Browser data (bookmarks/history/protected import/tabs)

`browserData` from `@workspace/runtime` is available to **panel and component
code**. It calls the `browserData` provider namespace selected in the manifest.
That provider's broker extension passes along the verified caller and is the
only code the BrowserDataDO accepts calls from, so panel code must not resolve
or call the DO directly. Non-sensitive imported records and visits recorded by
Vibestudio itself share this provider and store. Server-side eval (caller kind
`server`) cannot use the desktop import operations; run browser imports from
panel code or an `inline_ui`/`feedback_custom` component:

```tsx
import { browserData } from "@workspace/runtime";

const hosts = await browserData.listImportHosts();
const host = hosts.find((candidate) => candidate.connected);
if (host) {
  const sources = await browserData.listImportSources(host.hostId);
  const chrome = sources.find((source) => source.browser === "chrome");
  if (!chrome) throw new Error("Chrome is not available on the selected host");
  const job = await browserData.startImport({
    hostId: host.hostId,
    sourceId: chrome.sourceId,
    dataTypes: ["bookmarks", "history"],
  });
  console.log("Import job:", job.jobId, job.phase);

  // Optional: recreate current source-browser HTTP(S) tabs as Vibestudio panels.
  const tabs = await browserData.listOpenTabs(host.hostId, chrome.sourceId);
  const opened = await browserData.openTabsAsPanels({
    hostId: host.hostId,
    sourceId: chrome.sourceId,
    selection: tabs.map((tab) => tab.tabId),
    destination: "new-root",
    groupBy: "window",
  });
  console.log("Opened tabs:", opened);
}

const bookmarks = await browserData.exportBookmarks("json");
```

Browser profiles and filesystem paths are never exposed to userland.
`startImport` is deterministic for a given opaque host/source pair: rerunning it
updates changed records without creating duplicates. `openTabsAsPanels()` is
deliberately not idempotent and creates new panels on every call. By default it
creates a new root for the source browser with one nested collection per window.
Pass `destination: "caller"` to attach the tabs under the calling panel, or
`groupBy: "none"` to place every tab directly under the chosen anchor.

## Query a DO-backed App Database and Show Results

Store user-facing app data in a Durable Object service that uses SQLite through
`this.sql`. There is no generic app database endpoint for panels. Expose narrow
methods such as `listTodos` and `upsertTodo` on the DO and call them from UI
code. See
[workspace-dev/WORKERS.md](../workspace-dev/WORKERS.md#durable-object-backed-app-databases)
for the worker and manifest declaration.

```
inline_ui({
  code: `
import { useCallback, useEffect, useState } from "react";
import { Button, Flex, Text, Table, TextField } from "@radix-ui/themes";
import { rpc, workers } from "@workspace/runtime";
import { todoStoreRpcMethods } from "@workspace-workers/todo-store/contract";

export default function TodoStoreView({ props = {} }) {
  const protocol = props.protocol || "example.todos.v1";
  const objectKey = props.objectKey || null;
  const [title, setTitle] = useState("");
  const [todos, setTodos] = useState([]);
  const [error, setError] = useState(null);

  const resolveStore = useCallback(async () => {
    const service = await workers.resolveService(protocol, objectKey);
    if (service.kind !== "durable-object") throw new Error("Expected DO service");
    return service;
  }, [protocol, objectKey]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const service = await resolveStore();
      setTodos(await rpc.call(service.targetId, todoStoreRpcMethods.listTodos, []));
    } catch (e) { setError(e.message); }
  }, [resolveStore]);

  useEffect(() => { load(); }, [load]);

  const addTodo = useCallback(async () => {
    if (!title.trim()) return;
    setError(null);
    try {
      const service = await resolveStore();
      await rpc.call(service.targetId, todoStoreRpcMethods.upsertTodo, [{ title: title.trim() }]);
      setTitle("");
      await load();
    } catch (e) { setError(e.message); }
  }, [load, resolveStore, title]);

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2">
        <TextField.Root
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="New todo"
          style={{ flex: 1 }}
        />
        <Button size="1" onClick={addTodo}>Add</Button>
      </Flex>
      {error && <Text size="1" color="red">{error}</Text>}
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {todos.map(todo => (
            <Table.Row key={todo.id}>
              <Table.Cell><Text size="2">{todo.title}</Text></Table.Cell>
              <Table.Cell><Text size="1">{todo.done ? "Done" : "Open"}</Text></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}`,
  props: { protocol: "example.todos.v1", objectKey: "project-123" }
})
```

## Open a Website and Import Its Cookies

`openPanel` works from server-side eval, panels, workers, and DOs. `browserData`
goes through the browser-data broker declared in the manifest, so this recipe
must run from panel code or an `inline_ui`/`feedback_custom` component:

```tsx
import { openPanel } from "@workspace/runtime";
import { browserData } from "@workspace/runtime";

// Open the site in a browser panel
const handle = await openPanel("https://github.com");

// Import cookies from a trusted host's opaque Chrome source.
const hosts = await browserData.listImportHosts();
const host = hosts.find((candidate) => candidate.connected);
if (host) {
  const sources = await browserData.listImportSources(host.hostId);
  const chrome = sources.find((source) => source.browser === "chrome");
  if (!chrome) throw new Error("Chrome is not available on the selected host");
  const operationId = crypto.randomUUID();
  const status = await browserData.startSensitiveImport({
    hostId: host.hostId,
    sourceId: chrome.sourceId,
    dataTypes: ["cookies"],
    operationId,
  });
  // While status.state is "running" or "applying", call
  // observeSensitiveImport(operationId, { afterVersion: status.version }); it
  // resolves on the next change. Plaintext stays inside the host; only
  // aggregate status returns here.
}
```
