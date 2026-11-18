---
description: Prepare a response with grounded Vibestudio components for the relevant parts of an answer.
args:
  request: PresentationRequest
returns: PresentationReport
budget: { maxTurns: 32 }
---
1. Call planPresentation(request) to choose an order for the relevant sections. Use the sections themselves as the source of facts.
2. Follow the returned identifier order, looking up each original section by its id in request.sections. Call prepareSection with that section and retain its returned view exactly. Ask prepareSection once for each relevant section, including plain prose or custom work deferred to a caller. Pass through its plain, ready, deferred, or needs-review result.
3. Return the views in their executed order and omitted as the actual ids you did not use, in the input order. Required sections must all appear exactly once.
