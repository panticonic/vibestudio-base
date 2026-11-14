---
description: Name the cause of a failed tool or service call from its error message.
readout: decision
args:
  call: string
  message: string
returns: Cause
---
call is the tool or method that failed; message is its error. Name the cause:
- bad-arguments: the input was wrong: a missing, misspelled or invalid argument, a wrong type or shape, an unknown
  name or id, a value out of range, code that does not compile.
- wrong-context: the call was well formed but made in the wrong place or state: another workspace, context or branch;
  outside the caller's reachable context; an object that does not exist there; a state that must change first
  (uncommitted changes, an unresolved conflict, a stale revision).
- missing-authority: the caller has no grant, capability or permission for this, or its manifest did not request it.
- needs-approval: the call requires or awaits a person's approval or confirmation.
- transient: a passing condition: a timeout, a lost or reset connection, a busy, locked or rate-limited service. The
  same call can succeed later.
- platform-defect: the platform itself failed: an internal error, an invariant or assertion, a crash, a missing binding.
  Nothing about the call caused it.
- unknown: none of these.
