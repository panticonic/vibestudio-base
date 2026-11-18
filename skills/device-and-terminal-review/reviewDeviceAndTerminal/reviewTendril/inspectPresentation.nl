---
description: Check Tendril and channel identity, slot and device and the observed presentation state.
args:
  input: TendrilEvidence
returns: DeviceTerminalReview | null
---
No receipt means waiting / presentation-unobserved with target ID. Any tendril, channel, slot or device mismatch means blocked / presentation-target-mismatch with target ID then presentation ID. For presence, presented is ready / on-screen; pushed is waiting / notification-only; pending-device is waiting / waiting-for-device; archived is attention / presentation-archived. Cite the presentation ID. For event or update, an archived presentation blocks with presentation-archived and its ID. Otherwise defer the detailed diagnosis.
