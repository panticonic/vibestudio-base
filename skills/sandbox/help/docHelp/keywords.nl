---
description: Choose focused search terms for the information a documentation question requests.
args:
  question: string
returns: string[]
---
1. Identify the specific action, fact, or failure the question asks about, and the object it concerns.
2. Return focused search words or phrases expressing that request. Preserve exact identifiers the question names;
   use relevant technical vocabulary or synonyms when they help find the requested information.
3. Leave out conversational framing and incidental timing, sequence, or quantity context when those are not the
   requested information. Keep such a concept when it is itself what the question asks about.
4. Return a nonempty array of nonempty strings. These are retrieval queries; whether a passage actually answers
   the question is judged separately after retrieval.
