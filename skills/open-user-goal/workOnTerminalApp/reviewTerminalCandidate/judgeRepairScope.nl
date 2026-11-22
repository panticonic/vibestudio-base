---
description: Determine whether the actual app scope, build and native tests support a source repair.
args:
  app: TerminalRepairApp
  check: TerminalRepairCheck
returns: "repair" | "existing" | "hold-edit" | "hold-test" | "blocked"
---
If native test authority is absent, use hold-test. If a current build and complete native tests already pass, use existing. If source mutation authority is absent, use hold-edit. If there are compiler errors that identify an owned source defect or failing native assertions that identify the requested behavior, use repair. If authority is insufficient or current failures only identify infrastructure or an unavailable build/test surface, use blocked.
