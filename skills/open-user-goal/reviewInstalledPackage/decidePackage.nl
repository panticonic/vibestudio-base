---
description: Decide whether the package is already correct, needs a scoped restoration, or must be preserved.
args:
  assignment: PackageAssignment
  observed: PackageObservation
returns: PackageFinding
budget: { maxTurns: 14 }
---
1. Establish the protected package identity using assignment.target, observed.target, the working and baseline package names, and the catalog package name and source. The receiver names a worker declaration, not an npm package: its short name can differ from the package name. Use observed.declaredReceiverMatches for the native join of the deployed receiver to its declared source, class and protocol; the declaration needed to repeat that join is not supplied here. Hold genuinely mismatched package identities or a false native receiver match with hold-foreign-package.
2. If the field already matches, preserve-current. Otherwise an approval must match this exact source, field, key, baseline digest, working revision and working digest. Use hold-review-scope when that evidence is mismatched.
3. A matching scope must explicitly grant restore. For inspect-only or suspended scope use hold-authorization. Otherwise use restore-approved-field.
4. Explain the actual dependency, package export, or test declaration at issue and what remains unverified. Match the supplied baseline and scope instead of guessing replacement text.
