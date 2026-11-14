---
description: Decide whether a document section answers a question.
readout: decision
args:
  question: string
  section: string
returns: Fit
---
question is what an agent wants to know. section is one part of a document. Answer:
- answers: section states what to do, or what is true, for exactly what question asks: after reading it the agent
  could act on question or answer it.
- related: section is about the same tool, service or topic, but does not say what question asks.
- no: section is about something else.
