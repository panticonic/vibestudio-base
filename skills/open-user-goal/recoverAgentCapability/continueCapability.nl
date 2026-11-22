---
description: Confirm an owned retained result or retry the exact approved bounded step once.
args:
  evidence: ActionEvidence
  decision: CapabilityDecision
returns: "Continuation | null"
---
Return agentCapabilityContinue.apply(evidence.attempt.id, evidence.resultDigest, evidence.notebook.revision, decision). Use the exact outcome; a null result does not prove the action ran.
