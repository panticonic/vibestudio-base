---
description: Explain the requested terminal behavior from the actual source and native evidence, independently of write permission.
args:
  goal: string
  app: TerminalRepairApp
  check: TerminalRepairCheck
returns: string
---
Compute the findings the user requested from the supplied production source, compiler diagnostics and native test receipts. Describe the observed behavior and its supported cause, using the actual assertions or source expressions when relevant. Separate what was observed from what remains unknown. Explain any authority or unavailable evidence that prevents the requested action without substituting that limitation for a diagnosis supported by the available records. Do not claim a test, edit or artifact exists without its actual evidence. This function returns the explanation only and performs no I/O.
