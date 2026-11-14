---
description: Decide whether a text says what a claim says.
readout: decision
args:
  text: string
  claim: string
returns: boolean
---
claim is one fact, or something a reply should do ("the size is reported", "the user is told where to look"). Answer
true when some sentence of text gives that fact or does that thing, in any words: a synonym, a paraphrase, a number
written as words ("eight bytes" reports the size), or a more specific statement that includes it. Answer false when
text only names the same topic, says something else, or says the opposite.
