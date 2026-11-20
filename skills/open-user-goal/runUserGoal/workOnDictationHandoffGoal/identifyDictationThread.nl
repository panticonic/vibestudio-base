---
description: Select the exact owned draft conversation mentioned in the goal.
args:
  goal: string
  threads: DictationThread[]
returns: DictationThread
---
Choose the requested current conversation and target draft. Use the target, device, language and current title where the user supplies them. Keep the exact thread, including its baseline revision and explicitly authorized local scope. Nearby archive, rehearsal and other-owner records are separate evidence.
