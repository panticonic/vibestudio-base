---
description: Review actual prepared content readback against the user request before local commit.
args:
  request: Request
  brief: Brief
  plan: Plan
  documents: Draft[]
returns: Review
---
1. The caller already read these exact candidate documents. Use the supplied documents for this review. Judge their content, links, and grounding before the root commits. Check that every planned path and requested role is represented by readable useful content and that README points readers to the actual documents.
2. Match factual assertions and [fact:ID] citations to request.facts. Check exact identifiers, values, conditional requirements, prerequisites and the distinction between planned actions and observed outcomes. Identify unsupported claims or missing important facts. Check the conditions the source actually supplies. Leave unspecified cases outside the review rather than assuming additional requirements.
3. Judge whether this audience can use the documents for the requested work. Return ready only when all requested roles and grounded constraints are met and unsupportedClaims and blockers are empty. Explain concrete evidence; this internal review does not replace the independent harness verifier.
