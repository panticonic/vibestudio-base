---
description: Find the exact notify ref of the recipient the user named, or say why it is ambiguous.
args:
  utterance: string
returns: Resolution
---
Call resolve with utterance and return its result unchanged, from eval, so the ref stays exact. resolve lists who
can be messaged and takes the one the user names in so many words; it never guesses between equally named ones,
and when none is named it returns the whole roster for you to choose from.
