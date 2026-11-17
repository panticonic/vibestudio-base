---
description: Reproduce the reported behavior with the live panel.
args:
  request: Request
  initial: Observation
returns: Reproduction
---
1. Use the rendered controls in initial to choose the shortest interaction that distinguishes the report from correct behavior. Include the relevant before and after observations. Use the control roles and names as observed.
2. Run the interaction on initial.generation through panelRepair.interact. If the panel cannot load, report the initial failure and an empty interaction.
3. Return the interaction, what should happen, what actually happened, and whether that reproduces the reported behavior. Use the actual observation rather than an inference from source.
