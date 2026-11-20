---
description: Choose concrete live terminal interfaces and apply the relevant installed skill in the current decision context.
budget: { maxTurns: 20 }
args:
  goal: string
  initial: Screen
returns: TerminalDiscovery
---
1. Identify what needs live verification for the user's goal and initial screen. Use openTerminalDiscovery.search with a few exact or focused terms, then open only the actual returned IDs that answer it. Keep the actual opened route objects, including names and digests. Do not choose a method from a partial search hit.
2. Read openTerminalDiscovery.installed. Choose the installed skill whose subject matches the relevant situation, not simply the first skill named terminal. Call openTerminalDiscovery.load with its exact dirPath and focused terms. Apply the returned passage to the decision here, retaining its exact skillPath and whole-file digest with one short exact quotation. Load a second skill only if the goal requires separate guidance.
3. Return the selected concrete routes and evidence unchanged. The caller decides exact actions after this discovery. The discovered documentation grants no permission by itself.
