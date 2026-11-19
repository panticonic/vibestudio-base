---
description: Attribute a phone setup observation to the System workspace and uniquely selected provider and device.
args:
  input: PhoneSetupEvidence
returns: DeviceTerminalReview | { device: PhoneDiscoveryRecord | null }
---
In the rules below return one finding with the named evidence.
1. Outside System return blocked / phone-system-workspace-required with context ID.
2. For an existing pairing or readiness receipt, return { device: null } to use the saved receipts without a second discovery.
3. Eligible providers expose the requested platform; for a source install they also expose the platform in sourcePlatforms. If none and the provider list is empty, return waiting / desktop-provider-missing with target ID. Otherwise no eligible provider means blocked / provider-platform-unsupported with target ID.
4. If providerId is named require an exact eligible match. A mismatch means blocked / selected-provider-unavailable with target ID. With several eligible providers and no selection return waiting / choose-desktop with eligible receipt IDs in input order.
5. For discovery, an unprepared selected provider means waiting / desktop-preparation-pending with provider receipt ID.
6. Use devices only on that provider and requested platform. If attachedDeviceId is named require an exact match or return attention / selected-phone-unobserved with target ID and provider receipt ID in that order. Without a selection, choose the only ready device, or the only present device when none are ready. More than one ready device, or more than one present device when none are ready, means waiting / choose-phone with the ambiguous device receipt IDs in input order. No devices means waiting / phone-discovery-empty with provider receipt ID.
7. Return the chosen device unchanged.
