---
description: Answer a question from web pages, citing the URL, the day read and the exact sentence for every statement.
args:
  question: string
  sources: string[]
  retrievedAt: number
returns: CitedBrief
---
Call brief with question, sources and retrievedAt and return its result unchanged, from eval, so every citation stays exact.
sources are URLs the user supplied to read first; when it is empty, brief searches the web for the question itself.
retrievedAt is the invocation snapshot time in milliseconds since the Unix epoch; use that snapshot for every citation's read date.
