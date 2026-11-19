---
description: Decide how the inspected operation may proceed within the caller's own limits.
args:
  decision: 'AuthorityObservation["decision"]'
  outside: "ExactAuthority[]"
returns: AuthorityDisposition
---
If outside is nonempty return outside-ceiling. Otherwise for denied return host-denied, for acquirable return needs-acquisition, and for allowed return eligible. Eligible describes the observed preflight at this moment, without performing the operation.
