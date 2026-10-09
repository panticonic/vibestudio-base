---
name: testkit
description: Write and run deterministic in-system tests with @workspace/testkit, including panel automation, worker and Durable Object orchestration, runtime supervision, and bounded profiling. Use system-testing instead when an LLM must perform or judge the scenario.
---

# Testkit

`@workspace/testkit` is the deterministic layer beneath agentic system tests.
Use it when the expected behavior can be asserted directly. When a model must
interpret instructions or judge outcomes, use the `skills/system-testing` unit
in a development workspace that declares the System Testing template; Base
alone does not include that runner.

The full public API is in `src/index.ts`, and ready-to-run recipes are in
[`references/examples.ts`](references/examples.ts). For measurement design,
cold/warm semantics, and cleanup rules, use the `skills/performance` unit
installed in the System workspace.

## Eval conventions

- `scope`, `scopes`, and `chat` are ambient eval globals; do not import them.
- Store full results in `scope` and return only `summarize(result)`.
- Runs and profiles are written under `/.testkit/`. Do not inline large
  reports, CPU profiles, or heap snapshots.
- `panelTree` is a top-level runtime API. There is no `workspace.panelTree`
  namespace.

## Run deterministic suites

```ts
import { allSuites } from "@workspace/testkit/suites";
import { runSuites, summarize } from "@workspace/testkit";

const result = await runSuites(allSuites());
scope.testkitRun = result;
return summarize(result);
```

This package contains only base-workspace suites. Feature-specific suites live
in their feature packages; import them explicitly.

For a focused case:

```ts
import {
  expect,
  openPanel,
  panelText,
  runSuites,
  suite,
  summarize,
  waitForText,
} from "@workspace/testkit";

const greeting = suite("greeting").test("renders", async (t) => {
  const panel = await openPanel("panels/my-app");
  t.defer(() => panel.archive());
  await waitForText(panel, "Hello");
  expect(await panelText(panel), "panel text").toContain("Hello");
});

const result = await runSuites(greeting);
scope.testkitRun = result;
return summarize(result);
```

Tests supervise the panels they open and run deferred cleanup in LIFO order.
Turn supervision off only when the case deliberately produces the failure it
observes. Do not automate the panel that hosts the current eval.

## Panels, workers, and supervision

`openPanel` and `withPanel` wait until the panel has booted. Shell panel
creation only commits a slot, so do not use it with a sleep as a substitute.
Address existing panels through bounded `panelTree` reads.

The package also provides panel text and CDP helpers, worker/DO lifecycle
calls, unit diagnostics, and `supervise(...)`. Look up signatures in
`src/index.ts` or the live docs rather than copying an API list into a skill.
For supervision and logs, always select the specific live runtime identities.

## Profiling

Start with these helpers from `@workspace/testkit`:

- `profileBuild`: first-build and verified-cache build evidence.
- `profileHost`: server, workerd, and event-loop measurements around one
  workload.
- `profilePanelInteraction`: browser page, runtime, and network evidence.
- `profilePanelReload`: host resources and elapsed time across a runtime
  replacement.
- `profileWorkerd` or `profileDO`: bounded V8 CPU profiles.
- `readStartupProfile`: phases of the current boot.

These helpers bound their reports and clean up their inspector and page
connections. Electron process counters require `client_eval`, because they are
read on the client. Use raw CDP or inspector sessions only when the helpers
cannot answer the question, and close every session you open.

## Approval and cleanup

Panel automation, workerd inspection, host logs, and structural panel creation
may require their normal scoped approvals. Let the operation itself request
them; do not add a bypass or a preflight permission query.

Every test must clean up the panels, page clients, workers, temporary data, and
supervisors it creates. Keep state only when the user or harness explicitly asks
for it.

The `about/testbench` UI runs suites and shows saved runs and profiles. Use it
when a person wants live progress or flamegraphs; for automation, direct eval is
simpler.
