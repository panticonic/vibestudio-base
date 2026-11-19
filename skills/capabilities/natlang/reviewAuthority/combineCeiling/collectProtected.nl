---
description: Collect unique exact protected leaves across the ordered live reviews.
args:
  reviews: "AuthorityOperationReview[]"
returns: "ExactAuthority[]"
---
Read each observation's leaves in order. Copy each gated or critical capability and resourceKey pair when it first occurs. Two occurrences are the same only if both strings match. Exclude open leaves. Preserve encounter order and do not create wider scope.
