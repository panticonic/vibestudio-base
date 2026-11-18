---
description: Interpret only the caller-visible automation and run ledger from the supplied readback.
uses: [prepareAutomation/resolveVisible]
args:
  request: AutomationRequest
returns: RunBrief | AutomationHold
---
Call resolveVisible. Return its hold result if the requested automation is not uniquely visible. Use summarizeRun with the returned original record. Return its factual explanation of the requested automation. An unsuccessful run does not by itself change the automation's lifecycle state.
