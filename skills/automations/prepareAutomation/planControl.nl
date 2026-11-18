---
description: Resolve and plan an explicit owner-scoped lifecycle action.
uses: [prepareAutomation/resolveVisible]
args:
  request: AutomationRequest
returns: ControlDraft | AutomationHold
---
Call resolveVisible using only the requested target and the caller's supplied visible automations. Return its hold result if there is no unique match. Call chooseControl against the exact goal and observed lifecycle state. Return the typed control action for the resolved id, or explain the observed blocker. Never invent a replacement target.
