---
description: Choose literal search terms for the information a documentation question requests.
args:
  question: string
returns: string[]
---
1. Identify the specific action, fact, or failure the question asks about, and the object it concerns.
2. Return the content words or exact identifiers in question that express that request. Keep identifiers exactly
   as written. Use literal words from question; the caller checks them against the question's words.
3. Leave out conversational framing and incidental timing, sequence, or quantity context when those are not the
   requested information. Keep such a word when it is itself what the question asks about.
4. Return a nonempty array. Do not guess API names, file paths, synonyms, or other words absent from question.
