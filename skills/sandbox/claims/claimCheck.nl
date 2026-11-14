---
description: Say, for each claim, whether a text states it, contradicts it, or leaves it out, quoting the sentence that shows it.
args:
  text: string
  claims: Claim[]
returns: ClaimCheck
---
Call check with text and claims and return its result unchanged, from eval, so the quotes stay exact. check settles a
claim whose match pattern occurs in text, asks for a verdict on each other claim, and quotes the sentence of text
that bears on each one.
