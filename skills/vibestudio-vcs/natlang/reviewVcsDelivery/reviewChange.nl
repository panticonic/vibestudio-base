---
description: Explain the delivery candidate's effect and derive focused verification from it.
args:
  goal: string
  file: VcsDeliverySnapshot["file"]
returns: VcsDeliveryChange
---
Call interpretFile with goal and file. Call planChecks using the file path and that interpretation. Return the interpretation's effect and risks and the checks from planChecks.
