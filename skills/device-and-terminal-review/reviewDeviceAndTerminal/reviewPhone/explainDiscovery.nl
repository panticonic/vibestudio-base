---
description: Interpret one discovered device's immediate preparation condition.
args:
  device: PhoneDiscoveryRecord
returns: DeviceTerminalReview
---
Cite the supplied device receipt. Ready device means ready / phone-ready-for-setup. An emulator or simulator still booting means waiting / wait-for-emulator. An iOS signing issue means attention / mac-signing-required, with setup on the Mac. A discovery state unauthorized means waiting / accept-phone-trust. An offline device means waiting / restore-phone-connection. Developer Mode means waiting / enable-developer-mode. When none applies return waiting / follow-discovery, retaining the domain of the observed physical blocker.
