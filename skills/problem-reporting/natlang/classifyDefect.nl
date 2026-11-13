---
description: Decide whether a failure is a Vibestudio platform defect worth reporting, the user's own code, an expected refusal, or a transient failure.
readout: decision
args:
  evidence: Evidence
returns: DefectClass
---
Classify evidence, an account of something that went wrong. Judge by what failed and who owns it.

- platform: a Vibestudio tool or service gave a wrong result, threw an internal error, crashed, or contradicts its own
  documented behavior. The user's input was valid and the failure is not explained by their code.
- user-code: the failing code was written in the workspace (an app, panel, extension, worker or project file, including
  code the agent wrote earlier in this task) and the error is that code's own: a type error, a syntax error, an undefined
  name, a failed test or build of it.
- refusal: the platform refused on purpose: an approval was denied or dismissed, a capability or path was not allowed,
  an input failed validation, or a revision check asked for a fresh observation.
- transient: a network, rate-limit or timeout failure that happened once or cleared on retry.

When the failure was a refusal or a one-off, say so even if the message sounds alarming.
