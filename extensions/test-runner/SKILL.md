---
name: workspace-native-test-adapter
description: Run explicitly native workspace test suites through the context-aware verify tool.
---

# Workspace Native Test Adapter

Run native suites through `verify`; do not call this extension directly:

```ts
verify({
  operation: "test",
  target: "extensions/test-runner",
  suite: "native",
  file: "index.test.ts",
});
```

For caller-assigned verification or declaration review in Natlang, the shared
workflow exposes [`testSuite/reviewTestSuite`](../../skills/native-suite-review/reviewTestSuite.nl). It uses the live manifest plan and
the same verification entry point. [Workflow design](../../skills/native-suite-review/DECOMPOSITION.md).

The unit manifest must declare the named suite with `runtime: "native"`. Only
that declaration routes a suite here and requests
`native.code.execute-tests`.

The adapter checks the declaration against the materialized context. It uses
the host's prepared dependency environment for the selected unit, including its
declared development dependencies. An isolated Node child runs Vitest with
those read-only dependencies and scratch-owned test caches. The execution
identity includes the selected file and test-name filters. If the context
changes during verification, resolve the suite again and retry.

The child runs in the workspace's native execution domain: MXC resource
admission on Unix and the host user's normal permissions on Windows. Choosing a
context or suite does not add a filesystem security boundary.

Browser and workerd suites do not use this extension and do not request native
approval. A compatibility or build failure never falls back to this adapter.
