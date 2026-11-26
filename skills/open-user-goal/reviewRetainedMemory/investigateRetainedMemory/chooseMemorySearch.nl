---
description: Select the original evidence and recall mechanisms justified by the user's remembered claim.
budget: { maxTurns: 15 }
args:
  goal: string
  brief: MemoryBrief
returns: MemoryPlan
---
Ask provenance.provenanceMechanism about the original goal. For the bounded memory query, select concise distinctive subject words from the retained scope and original user request. Do not use unrelated role or person names as an identity.
Choose the evidence kinds that address the question: message for original discussion, file or commit for saved decisions and revisions. Group or revisit searches as useful; the order of kind names does not establish provenance. A current-file-only comparison can still need file and commit to recover older evidence.
Enable readTranscript for original conversation or disagreement with it; it reads the exact owned original independent of search. Enable readWorking only when the goal explicitly asks to distinguish a current unsaved draft from previous records.
