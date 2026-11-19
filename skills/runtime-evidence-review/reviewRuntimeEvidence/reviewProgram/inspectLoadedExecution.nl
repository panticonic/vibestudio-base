---
description: Decide the next step from the owned EvalDO execution receipt and its source revision.
args:
  receipt: RuntimeProgramInput["execution"]
returns: ProgramNext
---
A stale receipt needs refresh-program-receipt, even if the previous revision returned the expected output. A failed or unchecked execution needs inspect-trace. Its receipt identifies the owning EvalDO execution. A verified execution supports verified. If no receipt is present return call-reviewed-signature.
