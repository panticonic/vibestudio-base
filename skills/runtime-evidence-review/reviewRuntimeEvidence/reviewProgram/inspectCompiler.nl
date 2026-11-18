---
description: Route an actual Natlang compilation diagnostic to its own repair surface.
args:
  request: RuntimeProgramInput
returns: ProgramNext | "compiled"
---
For unchecked return compile. For passed return compiled. For failed callable scope return repair-callable-scope; for result-type return repair-result-contract; for unavailable declared service return bind-declared-service; for missing import return resolve-import. Otherwise use read-diagnostic. A compiled program signature does not prove an execution.
