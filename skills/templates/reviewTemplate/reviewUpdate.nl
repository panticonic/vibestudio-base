---
description: Decide when an installed monitor or a prepared workspace update is ready for its exact next step.
uses: [reviewTemplate/reviewHost]
args:
  request: TemplateUpdateInput
returns: TemplateDecision
---
Call reviewHost with request.host. For monitor intent call monitorState. Return its decision regardless of whether the discovered update can be prepared; monitoring uses the existing member-bound watch. For preparation or publication, return resolve-compatibility unless the receipt establishes same-epoch or epoch-handoff. In either compatible case call reviewCandidate. Preserve the exact operation ID supplied by that decision, or use targetPin when no candidate is applicable. Scope the response to the stated intent and return kind update.
