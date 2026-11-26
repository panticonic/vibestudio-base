---
description: Investigate useful owned evidence for the requested recovery.
args:
  goal: string
returns: ArchiveRecoveryInquiry
uses: [recoverContentArchive/discoverArchive, recoverContentArchive/inspectArchive, recoverContentArchive/chooseEdition, recoverContentArchive/planRestoration]
---
Investigate the user’s requested edition and useful working evidence using exact native discovery and read helpers, scoped edition judgment and working-diff analysis. Distinguish unavailable evidence, a foreign project, a current equal member, an actual collision, a coedit and a stale approval. Choose the evidence and degree of planning needed for the actual goal; unread observation, edition or plan stays null. Do not infer a successful restoration from a proposed plan or overwrite a current collaborator contribution.
