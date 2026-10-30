---
description: Choose how an automation should run each time it fires.
args:
  request: string
returns: ExecutorKind
readout: decision
---
Choose the executor for the automation that request describes, by the first rule that fits:
1. notify: the exact text to deliver is already known and nothing has to be looked up or worked out (a reminder, a fixed message).
2. tool: the request names one existing agent tool and its exact arguments, and wants that tool's output as it is.
3. method: the request names a reusable method on another service or Durable Object to call on a schedule, with no agent involved.
4. watch: the request checks a condition on a schedule and speaks up only when something changes or the condition is met; it stays quiet otherwise.
5. eval: each run is a small fixed script (read some state, compute, report the result every time) that needs no judgment.
6. prompt: anything else: each run needs the agent to think, summarize, decide, or write.
