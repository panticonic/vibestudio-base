---
description: Reproduce the reported behavior with the live panel.
args:
  request: PanelRequest
  initial: Observation
returns: Reproduction
---
1. Use the rendered controls in initial to choose the shortest interaction that distinguishes the report from correct behavior. Copy each role and name exactly. If navigation reveals new controls, read another observation before choosing the next step.
2. Run the interaction on the generation of the observation used to choose its controls. When a target or generation changes, acquire a fresh observation and continue from its actual state. If the panel cannot load, report the initial failure and an empty interaction.
3. Return the interaction, what should happen, what actually happened, and whether that reproduces the reported behavior. Use the actual observation rather than an inference from source.
