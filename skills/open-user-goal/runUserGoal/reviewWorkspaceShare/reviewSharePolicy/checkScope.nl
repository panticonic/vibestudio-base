---
description: Check exact workspace, recipient, membership, revision and permission evidence before interpreting the local role.
args:
  assignment: ShareAssignment
  observation: ShareObservation
returns: 'ShareDecision | null'
---
1. Return hold-workspace for a different workspace or document on the exact approval. Return hold-recipient when the approval or invitation addresses another person.
2. An account revocation or durable delete of the channel membership yields hold-revoked. A missing active session, workspace or channel membership yields hold-membership. A root or admin account does not replace a workspace membership.
3. Return hold-revision for a stale object version or digest. Return hold-invite for an invalid exact receipt, an invitation revision that differs from its current durable projection, or an approval referring to a different invitation revision.
4. Declined or withdrawn object approval yields hold-declined. Pending object approval yields hold-pending. The channel invitation's pending or acknowledged notice is separate from the object grant.
5. Return null if these scope checks support inspecting the local role.
