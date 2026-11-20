---
description: Interpret a user's verification goal against the declared routes available in this workspace.
args:
  goal: string
  routes: OpenSuiteRoute[]
returns: 'OpenSuiteChoice | null'
---
Identify which declared suite verifies the requested behavior or supplies the requested information. Use inspect mode for a request about a declaration and verify mode only for a request to execute a test. Use the exact requested file or test-name filter when stated, otherwise leave that filter null. Return null if no route addresses the request or if execution scope is unclear.
