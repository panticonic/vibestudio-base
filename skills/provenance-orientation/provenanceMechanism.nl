---
description: Choose the one provenance mechanism that answers a question about why tracked state is the way it is.
args:
  question: string
returns: ProvenanceMechanism
readout: decision
---
Choose the mechanism for question by the first rule that fits:
1. attached-read: it asks why bytes the asker has just read exist; the managed read already attached the answer.
2. cause: it asks what was actually being attempted, who asked, or what the original request behind one change was.
3. cohort: it asks what else was done in the same piece of work, request or turn as a change.
4. rejections: it asks whether something was tried and undone or rejected before, so as not to repeat it.
5. relate: it asks how two named things are related (the same request, a shared cause).
6. blame: it asks what a file or coordinate has been for over time, or whether its intent drifted across edits.
7. search: it describes a change or subject in words, and the asker does not know which file or change holds it.
8. memory-recall: it asks which record mentions a name or decision that no current file holds.
9. query: it asks for a set ("all X where Y", a count, an inventory over many changes).
10. direct-edges: none of the above fits; it asks for the direct edges of one given subject.
