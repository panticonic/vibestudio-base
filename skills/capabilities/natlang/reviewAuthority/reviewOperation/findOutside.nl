---
description: List exact protected resources that fall outside the caller's allowance.
args:
  leaves: "AuthorityHostLeaf[]"
  ceiling: "ExactAuthority[]"
returns: "ExactAuthority[]"
---
Read the leaves in order. For a gated or critical leaf, find an allowance with both the identical capability and the identical resourceKey. If neither field pair matches, copy the leaf's capability and resourceKey to the result. Skip open leaves. Preserve distinct resource identities. A host grant does not extend the caller's allowance.
