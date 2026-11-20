---
description: Distinguish current owner evidence from a copied, stale or foreign record.
args:
  scope: WelcomeScope
  resource: WelcomeResource
  row: WelcomeRow | null
  resolved: WelcomeResolution | null
returns: WelcomeEvidence
---
1. Keep the actual message and sender or null for missing-evidence. Hold for wrong-context, foreign-sender or stale-receipt when those exact fields do not match assigned scope, expected sender and revision, in that order.
2. For a current owner row use owner-unknown when unread or unknown, needs-verification when connected-unverified, and verified-current otherwise. A retained welcome gives welcome-retained without resending. A saved paused or deferred preference gives preference-preserved.
3. A setup selection requires the actual canonical route or gives invalid-route. A chooser selection means separate-workspace and leaves this conversation in place. A tour frame can proceed to the installed verifier when the actual scene exists.
4. A completed probe gives already-complete. An interrupted probe can proceed only for the explicitly authorized local retry with a native bound request. Return retry-ready in that case and retry-unauthorized otherwise.
