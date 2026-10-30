---
description: Find the exact notify ref of the recipient the user named, or say why it is ambiguous.
args:
  utterance: string
returns: Resolution
---
Call resolve with utterance and return its result unchanged, from eval, so the ref stays exact. resolve lists who
can be messaged, judges how well each one fits what the user said, and answers with one ref or an ambiguity.
