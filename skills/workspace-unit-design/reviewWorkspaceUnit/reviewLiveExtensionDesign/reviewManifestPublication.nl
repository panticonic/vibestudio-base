---
description: Determine whether the reviewed manifest is present on protected main.
args:
  observation: LiveExtensionDesignEvidence
returns: UnitFinding
---
Require both receipts to identify the exact requested unit and manifest digests. If either is missing or mismatched, return not-observed and manifest-publication-unobserved. Otherwise cite the working receipt followed by the published receipt. If the digests match return ready and manifest-published. If they differ return waiting and manifest-not-published. The result concerns the reviewed manifest only.
