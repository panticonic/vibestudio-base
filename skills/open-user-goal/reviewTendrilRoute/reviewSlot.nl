---
description: Identify the current retained presentation and project its exact local instruction.
args:
  goal: string
  board: TendrilRouteSnapshot
returns: TendrilSlotChoice
budget: { maxTurns: 11 }
---
Read the board's retained slots and the user's desired scope. Choose the same audience's current presentation, including the named presentation when requested. Being registered is not proof an offline or retired device can run the instruction. If the desired slot is missing, offline, retired or ambiguous, return held with the precise reason. Otherwise call probeSlot with the actual board snapshot and the selected slot record from its slots list and return its exact result.
