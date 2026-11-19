---
description: Identify relevant errors from the assigned renderer's observed console records.
args:
  observation: PanelHealthObservation
  expectation: PanelHealthExpectation
returns: string[]
---
Read diagnostics in sequence order. Include console/ followed by the record's sequence for each error whose full message is absent from expectation.allowedErrors. Treat informational and warning records as context.
