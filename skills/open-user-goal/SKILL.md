---
name: open-user-goal
description: Execute a user goal by selecting and composing the available Vibestudio Natlang capabilities.
---

# Open user goal

Load `skills/open-user-goal/runUserGoal.nl` with the current workspace's authorized
service bindings. Pass the user's request as the sole argument. The program can
investigate a public question or revise a workspace document using authoritative
information it discovers there.

Web actions use the current invocation's authorized public search and page cache.
Workspace revisions are scoped to the authorized documents and use an observed
version. A conflict calls for reading the current state and preserving the
other edit. Return the verified outcome or what blocked the task.
