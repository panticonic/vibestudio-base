---
description: Decide what kind of template an inspection describes.
args:
  inspection: TemplateInspection
returns: TemplateRole
readout: decision
---
Choose the role of the template by the first rule that fits:
1. base: it declares no dependencies and carries shared packages, workers, panels, skills and extensions.
2. development: it depends on another template and its repositories are test or acceptance harness material (test runners, test agents, system-testing skills).
3. system: it depends on another template and carries product clients, extensions and settings pages (clients/, extensions/, about/).
4. personal: it depends on another template and carries private user material: browser data, credentials, memory, onboarding.
5. catalog: anything else: an installable sample or integration about one topic (a world, a feed reader, a Google integration).
