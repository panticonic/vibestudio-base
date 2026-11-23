---
description: Plan and independently verify the requested setup or development delivery for the assigned Android test emulator.
args:
  goal: string
returns: AndroidDeliveryOutcome
---
Call readAndroidDeliveryScope with the exact goal. Call planAndroidDelivery with the goal and that scope. Call mobile.runMobileScenario on the plan and return the actual mobile scenario result directly, preserving unavailable, unauthorized and unverified outcomes.
