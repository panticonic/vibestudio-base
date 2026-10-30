---
description: Propose a problem report for a failure or poor result, from the evidence the agent already has. Nothing is saved or sent.
args:
  evidence: Evidence
returns: Draft
---
Call collect with evidence and return its result exactly as collect gave it, from eval. It removes secrets and private
paths from the evidence, fetches the bounded diagnostic when evidence names an invocation, and lays the account out as
the narrative sections of a report.
