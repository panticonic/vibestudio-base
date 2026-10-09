# Typed RPC Contracts

Use contracts for type-safe communication between parent and child panels.

If a connected website will use this RPC API, first read [website
development](WEBSITES.md) and [website
authority](../capabilities/references/website-authority.md). Every method,
stream, and event intake declares a website policy, separately from its
cross-workspace exposure and its operation authority.

## Cross-workspace calls

Parent-child panel relationships exist only within one workspace. To work with
another workspace, call a receiver it has explicitly exposed, using normal RPC
with a destination:

```typescript
const result = await rpc.call(receiverId, "listAvailableSlots", [], {
  destination: { kind: "workspace", workspaceId: destinationWorkspaceId },
});
```

Without `destination`, the call goes to the current workspace; other workspaces
are never searched. The receiving method must declare `crossWorkspace: true`.
The source's outgoing policy and the destination's incoming policy must both
allow the target and method before operation authority can be acquired. System
rejects application calls from other workspaces. A context selector stays
inside the selected workspace and cannot replace a workspace destination.

See [worker receiver declarations](WORKERS.md) for the method contract. Use the
existing RPC transport and cancellation behavior; do not build a separate export
registry or forwarding service.

## Define Contract

```typescript
// panels/editor/contract.ts
import { z, defineContract } from "@workspace/runtime";

export interface EditorApi {
  getContent(): Promise<string>;
  setContent(text: string): Promise<void>;
  save(): Promise<void>;
}

export const editorContract = defineContract({
  source: "panels/editor",
  child: {
    methods: {} as EditorApi,
    emits: {
      saved: z.object({ path: z.string(), timestamp: z.number() }),
      modified: z.object({ dirty: z.boolean() }),
    },
  },
});
```

## Export Contract

```json
{
  "name": "@workspace-panels/editor",
  "exports": {
    ".": "./index.tsx",
    "./contract": "./contract.ts"
  }
}
```

## Implement Child

```tsx
import { useEffect, useState } from "react";
import { rpc, getParentWithContract } from "@workspace/runtime";
import { editorContract } from "./contract.js";

const parent = getParentWithContract(editorContract);

export default function Editor() {
  const [content, setContent] = useState("");

  useEffect(() => {
    rpc.expose("getContent", () => content, {
      kind: "closed",
      reason:
        "Editor contents are private to the installed editor relationship.",
    });
    rpc.expose(
      "setContent",
      (request) => {
        const [text] = request.args as [string];
        setContent(text);
      },
      {
        kind: "closed",
        reason:
          "Only the installed editor relationship may replace editor contents.",
      },
    );
    rpc.expose(
      "save",
      async () => {
        await parent?.emit("saved", {
          path: "/file.txt",
          timestamp: Date.now(),
        });
      },
      {
        kind: "closed",
        reason:
          "Saving requires the installed editor relationship and its own source authority.",
      },
    );
  }, [content]);

  return (
    <textarea
      value={content}
      onChange={(e) => {
        setContent(e.target.value);
        void parent?.emit("modified", { dirty: true });
      }}
    />
  );
}
```

## Use from Parent

```tsx
import { useState } from "react";
import { openPanel } from "@workspace/runtime";
import { editorContract } from "@workspace-panels/editor/contract";

export default function IDE() {
  const [dirty, setDirty] = useState(false);

  const launch = async () => {
    // Opens the editor as a child of this panel.
    const handle = await openPanel("panels/editor");
    const editor = handle.withContract(editorContract, "child");
    editor.on("modified", ({ dirty }) => setDirty(dirty));
    editor.on("saved", () => setDirty(false));
    await editor.call.setContent("Hello");
  };

  return (
    <div>
      <button onClick={launch}>Open Editor</button>
      <span>{dirty ? "Modified" : "Saved"}</span>
    </div>
  );
}
```

## Child PanelHandle Methods

```typescript
child.id; // Stable panel slot ID
child.title; // Last observed title
child.kind; // "workspace" | "browser"
child.source; // Panel path or URL

child.call.method(args); // Call exposed RPC method
child.on("event", handler); // Listen for events
child.emit("event", payload); // Emit event to child
child.archive(); // Archive the panel subtree
```

## Parent PanelHandle Methods

```typescript
const parent = getParent(); // null when there is no parent
if (!parent) return;
parent.id; // Parent's ID
await parent.observe(); // Exact attempt, phase, source/context/ref/build provenance
parent.call.method(args); // Call parent's RPC method
parent.emit("event", payload); // Emit event to parent
parent.on("event", handler); // Listen for parent events
await parent.click("button"); // CDP click convenience; prompts on first automation use
```
