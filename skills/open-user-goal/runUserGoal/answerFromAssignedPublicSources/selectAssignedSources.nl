---
description: Extract only the public URLs explicitly assigned by the user for this decision.
args:
  goal: string
returns: string[]
budget: { maxTurns: 2 }
---
Return one to three distinct HTTP or HTTPS URLs copied literally in the order the user supplied them. Exclude surrounding punctuation, but preserve the URL's actual path, query and trailing slash. Do not add search results, inferred home pages or links merely mentioned in fetched text.
