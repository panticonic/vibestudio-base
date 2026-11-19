---
description: Interpret the bounded selected-file metadata before source bytes are copied.
args:
  request: TemplateTransferInput
returns: "refine-selection" | "ready"
readout: decision
---
The selection supports at most 200 files and 4 MiB (4194304 bytes) and must contain regular or executable files only. Return refine-selection when the metadata exceeds either bound, contains zero files or reports an unsupported selection. Otherwise return ready. The receipt holds authoritative metadata; do not fetch source contents to decide.
