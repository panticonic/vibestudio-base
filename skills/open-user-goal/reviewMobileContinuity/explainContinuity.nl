---
description: Explain the requested continuity finding from actual current mobile observations.
args:
  goal: string
  profile: MobileContinuityProfile
  evidence: MobileContinuityEvidence
returns: MobileContinuityFinding
---
Answer the user's actual question using the supplied profile and observations. Distinguish current authenticated build and route ownership from cached appearance. Explain a failed device/app/build check, revoked trust, changed authenticated server, closed connection or nontransient failure when it matters to the requested use.

A route listed as lost or held elsewhere is not an unleased route. Retained cache does not permit continuing to use that route or taking it from its owner. Consider reacquisition only when the current evidence says the route is unleased and the user permits it. Distinguish missing or rejected same-scope cache from healthy retained authority, and old-runtime releases from current ownership. Describe the supported next step when the user asks for one, without claiming that an observation performed it. Never claim actual-device proof from local replay.
