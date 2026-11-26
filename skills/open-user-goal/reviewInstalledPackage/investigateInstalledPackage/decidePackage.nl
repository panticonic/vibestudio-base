---
description: Explain the actual installed declaration, its protected baseline and the authority relevant to the user's question.
args:
  assignment: PackageAssignment
  observed: PackageObservation
returns: PackageFinding
budget: { maxTurns: 14 }
---
Investigate the question in assignment.goal using the actual package observation. Join the assigned package to its current and baseline names and the catalog source/name. The worker receiver's short declaration name may differ from the npm package name; declaredReceiverMatches records the native declaration/class/protocol join.

Distinguish current facts from restoration authority. protectedValueMatchesBaseline says only whether the selected current manifest value equals its protected baseline. A false value can describe exactly the current declaration the operator asks about; it does not show a foreign plan, stale scope, or missing inspect permission. scopeMatches separately reports whether the review identifies the exact current source, field, key, working revision and digests. The scope's grant decides whether restoration is permitted, not whether an admitted read or current suite plan is truthful.

Explain the actual dependency, export or suite declaration and any difference from the protected baseline. For a suite, distinguish its declared name from its runtime: a suite named native may currently route to browser or workerd. Its current source, suite name and runtime determine which returned verification plan belongs to that declaration. The native suiteRequest supplies an inspect-only plan request; it does not require opening a renderer or running a suite. Report what is established and what remains unobserved.

When the goal actually requests a restoration, assess its exact scope, grant and current state before recommending that action. Do not treat an inspection goal as a request to restore the baseline, require restore permission merely to answer it, invent a successful mutation, or reuse stale authority. Return your grounded findings in natural language for the caller's composition.
