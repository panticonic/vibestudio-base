---
description: Review the exact installed workspace worker package and conditionally restore a locally approved declaration.
args:
  goal: string
returns: InstalledPackageOutcome
budget: { maxTurns: 24 }
---
1. Call discoverPackage. Pass that assignment and the user's goal into inspectPackage. Read the actual installed package and its baseline before deciding.
2. Call decidePackage with the assignment and observation. When it returns restore-approved-field, call restorePackage with the exact observation. Otherwise do not edit and keep repair null. A state-changed response means another edit won and must be preserved.
3. Call reviewVerification with the latest actual observation, using repair.observation if there was a repair attempt. Report the exact current verification route if a suite was declared and supported. Do not run it or claim its tests passed.
4. Return the unchanged assignment, observed package, finding, repair receipt or null, and verification report or null. Keep changes local and limited to the reviewed package field.
