---
description: Decide whether the package is already correct, needs a scoped restoration, or must be preserved.
args:
  assignment: PackageAssignment
  observed: PackageObservation
returns: PackageFinding
budget: { maxTurns: 14 }
---
1. Hold a package where the working and baseline names differ or the actual receiver and catalog do not match the protected installation. Use hold-foreign-package.
2. If the field already matches, preserve-current. Otherwise an approval must match this exact source, field, key, baseline digest, working revision and working digest. Use hold-review-scope when that evidence is mismatched.
3. A matching scope must explicitly grant restore. For inspect-only or suspended scope use hold-authorization. Otherwise use restore-approved-field.
4. Explain the actual dependency, package export, or test declaration at issue and what remains unverified. Match the supplied baseline and scope instead of guessing replacement text.
