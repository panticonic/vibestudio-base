---
description: Propose the smallest exact source edits that repair the current observed terminal behavior.
args:
  goal: string
  check: TerminalRepairCheck
returns: TerminalRepairPlan
---
Read the original goal and actual source, diagnostics and native test failures. Find the cause and preserve documented existing behavior. Use the observed production file paths and exact full before text. Return a reason and complete after text for each needed file. Protect the original manifest and tests. If the source is insufficient, return blocked with no edits. Never add authority, change the declared test runtime or assume a different revision.
