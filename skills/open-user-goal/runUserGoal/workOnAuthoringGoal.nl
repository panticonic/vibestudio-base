---
description: Review a current authored Natlang program, recover from changed source, and stage an authorized review handoff.
args:
  goal: string
returns: AuthoringOpenOutcome
budget: { maxTurns: 18 }
---
1. Call discovery.discoverAuthoring(goal). Return {status: "unresolved"} if no selection is bound.
2. Call reviewer.reviewProgram with its request unchanged. Keep the actual selection and actual review together as a receipt. Ask discovery.confirmAuthoringReview whether the source still matches it.
3. If the source changed, repeat discovery and review once using the user's original goal. Confirm the new receipt. If you still lack a current receipt, return {status: "unresolved"}.
4. Call decideHandoff with goal and the current receipt. If it says stage, call discovery.writeAuthoringHandoff with that receipt. Return the current receipt and the actual artifact or null in a "reviewed" outcome. Review only. Preserve the authored and released program sources.
