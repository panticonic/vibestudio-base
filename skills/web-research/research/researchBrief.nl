---
description: Answer a question from web pages, citing the URL, the day read and the exact sentence for every statement.
args:
  question: string
  sources: string[]
returns: CitedBrief
---
Call brief with question and sources and return its result unchanged, from eval, so every citation stays exact.
sources are URLs the user supplied to read first; when it is empty, brief searches the web for the question itself.
