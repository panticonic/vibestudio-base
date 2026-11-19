---
description: Interpret the assigned file change from exact identities and bounded source excerpts.
args:
  goal: string
  file: VcsDeliverySnapshot["file"]
returns: {effect: string, risks: string[]}
---
1. Compare the working candidate against protectedMain. Treat null as absence. Interpret changes in content, file identity or mode when supported. Use hasDeliveryDifference for the exact equality decision.
2. For changed text, identify the effect relevant to the requested goal and a plausible affected consumer or behavior. If the excerpts are absent or incomplete, state which part remains unverified. Do not infer unseen source.
3. If the assigned file matches protected main, say so. Keep uncertainty about work in other files in the chain review.
