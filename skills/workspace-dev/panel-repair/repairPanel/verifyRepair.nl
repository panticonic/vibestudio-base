---
description: Determine whether a rebuilt panel satisfies the live interaction contract.
args:
  request: Request
  reproduction: Reproduction
  candidate: Observation
  checks: Checks
returns: Verification
---
1. Read the current panel observation. Confirm its revision equals candidate.revision. Exercise the original behavior using the generation and exact control role/name from that observation.
2. Exercise checks.preserveBehavior as well as checks.requiredBehavior. Read visibleText for display-only evidence. After navigation, choose newly rendered controls from the resulting observation. If the generation or target changes, reobserve before choosing another action and account for any effects already observed.
3. Return the observed evidence and pass only when it establishes the requested behavior and the preservation checks. Include any failure clearly enough for another diagnosis.
