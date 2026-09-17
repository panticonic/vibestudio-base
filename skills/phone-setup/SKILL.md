---
name: phone-setup
description: Discover an attached phone or emulator, install Vibestudio, and pair it to the current account and workspace.
---

# Phone setup

Success means the phone’s visible workspace is ready, not merely installed or paired. Ask only for the next physical
action supported by discovery, then rediscover. Don't require the user to
interpret adb, Xcode, provider, or pairing internals.

This is the end-user flow through a connected desktop. For repository work on a
developer device, use [mobile debug](../../extensions/mobile-debug/SKILL.md).

## Setup owner

Phone setup is an account operation owned by System. The desktop's **Devices →
Set up a phone** action opens its setup chat there. In a Personal or project chat,
guide the user to that entry point before starting this workflow. Do not try to
call into System from another workspace or install a second phone provider.

## Interactive setup

Render the shared card once. It handles preparation, desktop/phone selection,
progress, physical-action guidance, errors, and retries without round trips to
the agent:

```ts
inline_ui({ id: "phone-setup", path: "skills/phone-setup/PhoneSetup.tsx" });
```

The card uses the public service; adb, Xcode, and the phone are attached to the
user's desktop. Never expose a pairing secret. Do not call the private
`phoneNativeEndpoint` transport or pass its `clientId`/`input` wrapper to the
public service.

## Agent automation

For unattended testing or an explicit request to complete setup directly, use
the same client as the card:

```ts
import { phoneSetup } from "@workspace-skills/phone-setup";
const phone = await phoneSetup();
const providers = await phone.providers();
if (providers.length !== 1) throw new Error("Choose a desktop in the setup card.");
const provider = providers[0];
await phone.prepare(provider.providerId, "android");
const found = await phone.devices(provider.providerId, "android");
const ready = found.devices.filter(device => device.ready);
if (ready.length !== 1) throw new Error("Choose a ready phone in the setup card.");
const device = ready[0];
const paired = await phone.provision({ providerId: provider.providerId,
  platform: device.platform, deviceId: device.deviceId });
const workspace = await phone.waitForWorkspace(paired);
return { paired, workspace }; // Success ONLY if workspace.status === "ready".
```

Resolve providers and devices before choosing; the abbreviated example does not
justify picking the first of multiple choices. `phoneSetup()` resolves
`workers.resolveService("vibestudio.phone-provisioning.v1")` once. For direct API
work, open its live docs. Preserve returned provider and device IDs exactly.
`provision` is a stream: use the helper rather than `rpc.call`.

Prepare tools before discovery. Missing Android tools are installed with checksum
verification by the desktop after normal approval; no SDK or terminal steps.
No desktop: ask the user to open the desktop app on the same account/server.
No ready phone: explain the observed physical action, then rediscover.

Once paired, retain the result. If workspace preparation is slow or fails,
repeat `phone.readiness(paired.pairedDevice.deviceId)` or `waitForWorkspace`.
Never reinstall or create another invite just to check readiness. Tell the user
they may unplug only after `status: "ready"`. A waiting/failed state is not success.
Normal installed-agent requests and user review apply; do not add eval authority
overrides or retry a fixed-code manifest denial.

## Android readiness

Use only the steps discovery requires:

- Unlock the device and connect with a data-capable USB cable. Try a different
  data USB mode, cable, or port when no device appears.
- If required, enable Developer options (tap build number), then enable USB
  debugging. Menu placement varies by manufacturer.
- Keep the phone unlocked and accept the USB-debugging trust prompt. Remembering
  the desktop is optional.
- `unauthorized` = unresolved phone-side trust prompt. `offline` =
  connection/readiness problem. Don't install until discovery reports ready.

For emulators: wait for the home screen. No cable or RSA prompt needed.

## iPhone readiness

iPhone dev installation requires a connected Mac with Xcode and valid signing:

- Unlock the phone, connect to the Mac, trust the computer.
- Enable Developer Mode if iOS requests it.
- Let Xcode prepare the device and configure the development team if signing is
  missing.
- Rediscover only after Xcode reports the device ready.

Source deployment from Windows/Linux requires a Mac provider — don't present it
as a phone-side repair.

## Recovery

- **No provider**: reconnect the desktop app to the same account/server.
- **No device**: check unlock, cable/data mode, trust/debugging, provider state.
- **Unauthorized/offline**: resolve the phone-side prompt or physical
  connection, then rediscover instead of repeatedly provisioning.
- **Install failure**: preserve the exact provider issue; check storage,
  compatibility, signing, and build modes.
- **Pairing timeout**: keep both devices awake, verify connectivity, retry the
  single provision transaction. Don't mint an agent-visible invite.
- **Workspace preparation**: wait for or diagnose the real readiness condition;
  process liveness is insufficient.

For repository diagnostics, capture the physical debug-device identity before
provisioning and use `mobile-debug.verifyWorkspaceReady` afterward. A hub device
ID ≠ an adb serial; keep those identities separate. Don't use the development
extension in ordinary onboarding.

If trusted desktop provisioning is unavailable, direct the user to the shell's
Devices surface and its pairing QR. Don't split the automated operation into
manual hub-control or credential steps.
