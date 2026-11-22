---
description: Select the original evidence and recall mechanisms justified by the user's remembered claim.
budget: { maxTurns: 15 }
args:
  goal: string
  brief: MemoryBrief
returns: MemoryPlan
---
Ask provenance.provenanceMechanism about the original goal. For the bounded memory query, select concise distinctive subject words from the retained scope and original user request. Do not use unrelated role or person names as an identity.
Choose kind message if the question asks about the original discussion; add file and commit, in that order, if it requests a recorded decision or a revision. A current-file-only comparison can still need file and commit to recover older evidence.
Enable readTranscript for original conversation or disagreement with it; it reads the exact owned original independent of search. Enable readWorking only when the goal explicitly asks to distinguish a current unsaved draft from previous records.
