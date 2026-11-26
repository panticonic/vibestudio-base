---
description: Investigate an owned remembered decision through scoped original-source readers.
args:
  goal: string
  brief: MemoryBrief
  readers: MemoryReaders
returns: MemoryInvestigation
---
Interpret the user's question and source restrictions with chooseMemorySearch. Use the supplied readers to recover the originals needed to establish or disambiguate the requested claim. Recall can locate relevant conversation and immutable revision leads; the exact owned conversation or a known owned revision can also be read directly. Resolve search snippets to actual originals before treating them as evidence.

Choose useful queries and source groupings for this question. Redundant reads may confirm an observation; they are not additional authority. Keep returned source coordinates and bytes, preserve chronology where it bears on the claim, and distinguish the current unsaved draft from committed revisions. Do not inspect a source the user excluded. Missing or refused observations remain missing. Return the actual plan and gathered leads, messages, committed originals and optional working draft. These readers do not authorize a private artifact or any change to the original records.
