---
description: Decide whether a recorded intent says why work was done, not only what was done.
readout: decision
args:
  text: string
returns: boolean
---
text is the recorded intent of some work. Answer true when it states a reason, a goal or a problem behind the work,
for example it says "because", "so that", "to avoid", "to stop X from" or names what was going wrong. Answer false
when it only says what was done ("Add retry to the loader", "Rename the helper", "Fix the failing test").
