---
description: Read stable retained transcript windows for the selected conversations.
args:
  goal: string
  sourceIds: string[]
returns: RecoveryWindow[]
---
Use recoveryReplay.resume for the selected owned sources. Preserve each returned source identity, saved cursor, snapshot frontier, coverage and exact retained messages. The native resume operation returns a bounded window from the saved cursor; repeating it does not prove that later messages were included. Honor any explicit first-then condition in the user goal. Independent sources may be read together and redundant observations do not add authority. Return the actual windows needed for the requested recovery judgment.
