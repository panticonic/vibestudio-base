---
description: Investigate current authority and a justified coordinated revision using the actual owned document codebase and revision policies.
args:
  goal: string
  previous: RevisionInvestigation | null
returns: RevisionInvestigation
uses: [reviseCoordinatedDocuments/workspace/discoverRevisionDocuments, reviseCoordinatedDocuments/assessRevisionAuthority, reviseCoordinatedDocuments/planCoordinatedRevision, reviseCoordinatedDocuments/reconcileCoordinatedRevision]
---
Establish the current owned document scope and the factual approval conditions needed by the goal. The authority assessment describes prerequisites to an edit, not a claim that the edit has already happened. Use actual signed source text and the evidence-rule codebase; preserve unresolved or withdrawn conditions.

Choose an initial justified plan or reconsider the actual previous proposal against current observations, according to the evidence relationship. The revision-policy functions interpret requested changes and preserve unrelated text; they do not perform a mutation here. Keep real identity changes, competing instructions and already completed destinations visible in the returned scope, authority and plan. A prior proposal never renews an approval or overrides current coedits.

Return these actual investigation values for the outer coordinator's decision. This investigation acquires and interprets evidence; it does not apply a document batch or assert completion of the caller's whole goal.
