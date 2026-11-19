---
description: Check each assigned DOM marker and its exact ordered values.
args:
  observation: PanelHealthObservation
  expectation: PanelHealthExpectation
returns: string[]
---
For each expected marker in order, find the exact id in observation.markers. When the id is missing, occurs more than once or its values differ in length, text or order, include marker/ followed by the assigned id. Return the blocker list.
