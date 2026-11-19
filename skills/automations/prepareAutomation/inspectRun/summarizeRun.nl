---
description: Summarize the actual mission state, latest admitted run, and recorded failing operation names.
args:
  automation: VisibleAutomation
returns: RunBrief
---
Keep the exact id and lifecycle state of the supplied record. If latestRun is absent, set runId and outcome to null. For a present run use its actual id and outcome, including a null outcome during a nonterminal phase. Use the operation names from recorded errors in order without inferring missing operations. A run with completed-with-errors remains that outcome even if the final turn returned normally.
