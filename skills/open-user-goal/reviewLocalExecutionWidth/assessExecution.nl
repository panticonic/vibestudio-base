---
description: Join current local lifecycles, selectable providers and completed execution slots.
args:
  goal: string
  survey: WidthSurvey
  readiness: Readiness | null
returns: WidthFinding
budget: { maxTurns: 17 }
---
1. Answer the actual requested model and capacity question. Consider an alternative only when the user permits one. Choose sufficient relevant evidence for the requested comparison; do not treat a private ranking or every alternative as a required route. If acquired, installed readiness can inform current lifecycle and alternative selection. Null readiness means it was not requested or acquired, not that a model is absent.
2. A selectable provider row must match this scope's exact machine, boot and configuration, with the matching inventory model and server lane. A catalog listing, running server, warmed fallback or another model on the same server is insufficient. Keep the exact refs. A missing or unusable inventory model gives model-unavailable. A usable model with no selectable current provider gives provider-unavailable. Provider and inventory must both satisfy the context and tool requirements or report incompatible.
3. For a compatible provider, identify the current same-lane server and keep its advertised width when available. Do not reuse data from another machine, boot, configuration or lane. A startable model can be started later when authorized but gives startable without a measured running width. A ready model without a current running server listing that exact model remains unproven-width.
4. Read relevant current same-model, same-provider, same-lane witnesses using readWitness. Use evaluateWitness for acquired receipts. If the question asks for maximum demonstrated width, obtain enough evidence to establish that conclusion. Equally valid records need no opaque ID tie-break; cite the actual record supporting the reported width. Separate witnesses describe distinct intervals, so do not combine their work. Null evidence produces unproven-width. A smaller actual width produces short-width. A width at or above the requested width produces verified.
5. Return the actual ref, provider, advertised width, witnessed width, witness ID, and a grounded explanation. On unavailable model keep its requested ref if one was specified, but provider and widths are null. On provider-unavailable keep the inventory ref and leave provider and widths null. On incompatible keep the current provider and ref, but leave widths and witness null.
