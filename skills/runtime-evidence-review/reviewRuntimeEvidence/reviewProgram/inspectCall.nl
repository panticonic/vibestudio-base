---
description: Use one exact retained call's status before deciding to inspect or rerun it.
args:
  request: RuntimeProgramInput
returns: ProgramNext
---
If no call, return call-reviewed-signature. If still running return await-call. After a failed call, use rerun-exact-input only when the user explicitly asked and the input is exactly retained; otherwise inspect-trace. A returned output still needs inspect-trace if unchecked. Return verified for an independently checked returned output.
