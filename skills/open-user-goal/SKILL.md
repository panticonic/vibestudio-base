---
name: open-user-goal
description: Execute a user goal by selecting and composing the available Vibestudio Natlang capabilities.
---

# Open user goal

Load `skills/open-user-goal/runUserGoal.nl` with the current workspace's authorized
service bindings. Pass the user's request as the sole argument. The program can
investigate a public question or revise a workspace document using authoritative
information it discovers there. For a browser goal, it observes the authorized
panel, chooses visible controls only for requested changes, and reads back the
result after each operation.

The same entry point exposes the workspace's installed News, Spectrolite, and
Drive subtrees when available. Each subtree takes the original user goal,
discovers its current state through the caller's services, and returns its
verified outcome.

For a workspace verification goal, the program discovers declared suites and
chooses the route and requested filter. It reports the declared runtime and
approval for a planning request. When the user requests execution, it binds the
run to the discovered source revision and reports the actual receipt.

Web actions use the current invocation's authorized public search and page cache.
Workspace revisions are scoped to the authorized documents and use an observed
version. A conflict calls for reading the current state and preserving the
other edit. Return the verified outcome or what blocked the task.
