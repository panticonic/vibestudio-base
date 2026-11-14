---
description: Decide whether a text says the opposite of a claim.
readout: decision
args:
  text: string
  claim: string
returns: boolean
---
claim is one fact. Answer true only when text explicitly says the fact is false, or that what it describes did not
happen, failed, or could not be done. Answer false when text says nothing about it, or only talks about something
else.
