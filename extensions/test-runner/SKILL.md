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

The unit manifest must declare the named suite with `runtime: "native"`. Only
that declaration routes a suite here and requests
`native.code.execute-tests`.

The adapter checks the declaration again against the materialized context, then
launches Vitest in a fresh Node child process with an allow-listed environment,
the installed test-engine dependencies, and a fresh writable scratch directory.
Selected workspace modules are imported in that child, not in the long-lived
extension process.

The child runs in the workspace's native execution domain: MXC resource
admission on Unix and the host user's normal permissions on Windows. Choosing a
context or suite does not add a filesystem security boundary.

Browser and workerd suites do not use this extension and do not request native
approval. A compatibility or build failure never falls back to this adapter.
