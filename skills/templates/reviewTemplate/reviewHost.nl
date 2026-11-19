---
description: Interpret the actual host selector and composed source-compatibility readback.
args:
  host: TemplateHostReceipt
returns: Compatibility
readout: decision
---
Choose schema-unsupported if the source schema cannot be composed. Next choose matching-host-required when the target epoch's host is unavailable. Next choose minimum-version-required when that matching host fails the composed minimum. Otherwise choose epoch-handoff when the current and target epochs differ, or same-epoch when they match. Trust the host's compatibility receipt for the composed minimum; do not compare version strings or rewrite source metadata.
