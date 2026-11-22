---
description: Decide what the exact effect or preflight established for this route.
args:
  goal: string
  offer: RouteOffer
  authority: RouteAuthorityReport
  choice: RouteChoice
  readback: RouteReadback | null
returns: RouteOutcome
---
1. For a selected local route, a missing required read is missing. For the two-source comparison, preserve both observed values, use mismatch if they differ, and verified if their exact values agree. A completed single exact read is verified, with its scope.
2. For the nominated external link, return outside-limit, needs-approval, refused, or eligible-preflight according to the exact operation's disposition. Keep the distinction between checking eligibility and actually accessing an external source.
3. Summarize the exact effect, gap, or permitted origin and avoid exposing unnecessary unrelated records. No external page or live provider result was inspected.
