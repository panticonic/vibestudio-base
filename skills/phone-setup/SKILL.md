---
name: phone-setup
description: Discover an attached phone or emulator, install Vibestudio, and pair it to the current account and workspace.
---

# Phone setup

Setup is done when the workspace on the phone is ready. Installing the app or
pairing the phone is not enough. Ask the user for one physical action at a time,
based on what discovery reports, then rediscover. Don't make the user interpret
adb, Xcode, provider, or pairing details.

This skill covers end-user setup through a connected desktop. For repository
work on a developer device, open the System workspace and use its
`extensions/mobile-debug` unit if installed.

## Where setup runs

Phone setup is an account operation that runs in the System workspace. The
desktop's **Devices → Set up a phone** action opens a setup chat there. In a
Personal or project chat, send the user to that entry point instead of starting
this workflow. Do not call into System from another workspace or install a
second phone provider.

## Interactive setup

Render the setup card once. It handles preparation, desktop and phone
selection, progress, guidance for physical steps, errors, and retries without
going back to the agent:

```ts
inline_ui({ id: "phone-setup", path: "skills/phone-setup/PhoneSetup.tsx" });
```

The card uses the public service; adb, Xcode, and the phone are attached to the
user's desktop. Never reveal a pairing secret. Do not call the private
`phoneNativeEndpoint` transport or pass its `clientId`/`input` wrapper to the
public service.

## Agent automation

For unattended testing, or when the user explicitly asks you to complete setup
yourself, use the same client as the card:

```ts
import { phoneSetup } from "@workspace-skills/phone-setup";
const phone = await phoneSetup();
const providers = await phone.providers();
if (providers.length !== 1)
  throw new Error("Choose a desktop in the setup card.");
const provider = providers[0];
await phone.prepare(provider.providerId, "android");
const found = await phone.devices(provider.providerId, "android");
const ready = found.devices.filter((device) => device.ready);
if (ready.length !== 1)
  throw new Error("Choose a ready phone in the setup card.");
const device = ready[0];
const paired = await phone.provision({
  providerId: provider.providerId,
  platform: device.platform,
  deviceId: device.deviceId,
});
const workspace = await phone.waitForWorkspace(paired);
return { paired, workspace }; // Success ONLY if workspace.status === "ready".
```

List providers and devices before choosing. The example throws when there is
more than one choice; never just pick the first. `phoneSetup()` resolves
`workers.resolveService("vibestudio.phone-provisioning.v1")` once; open that
service's live docs for direct API work. Pass returned provider and device IDs
through unchanged. `provision` streams its results, so call it through the
helper, not `rpc.call`.

Prepare tools before discovery. After the usual approval, the desktop installs
any missing Android tools and verifies their checksums; the user needs no SDK or
terminal steps. If there is no desktop, ask the user to open the desktop app on
the same account and server. If no phone is ready, explain the physical step
discovery points to, then rediscover.

`waitForWorkspace` follows the workspace's actual lifecycle and has no built-in
deadline. An optional third argument, an `AbortSignal`, cancels the pending
RPC or observation and rejects with the original cancellation reason. A
transport failure rejects with its original error; the pairing result you
already saved is unaffected.

Keep the pairing result. If workspace preparation is slow or fails, call
`phone.readiness(paired.pairedDevice.deviceId)` or `waitForWorkspace` again.
Never reinstall or create another invite just to check readiness. Tell the user
they may unplug only after `status: "ready"`; a waiting or failed state is not
success. The usual installed-agent permission requests and user review apply.
Do not add eval authority overrides, and do not retry a fixed-code manifest
denial.

## Android readiness

Use only the steps discovery requires:

- Unlock the device and connect it with a USB cable that carries data. If no
  device appears, try a different USB mode, cable, or port.
- If required, enable Developer options (tap build number), then enable USB
  debugging. Menu placement varies by manufacturer.
- Keep the phone unlocked and accept the USB-debugging trust prompt. Remembering
  the desktop is optional.
- `unauthorized` means the trust prompt on the phone hasn't been accepted.
  `offline` means a connection or readiness problem. Don't install until
  discovery reports the device ready.

For emulators, wait for the home screen. No cable or RSA prompt is involved.

## iPhone readiness

Installing a development build on an iPhone requires a connected Mac with Xcode
and valid signing:

- Unlock the phone, connect to the Mac, trust the computer.
- Enable Developer Mode if iOS requests it.
- Let Xcode prepare the device and configure the development team if signing is
  missing.
- Rediscover only after Xcode reports the device ready.

Deploying from source on Windows or Linux requires a Mac provider. Don't present
that as something the user can fix on the phone.

## Recovery

- **No provider**: reconnect the desktop app to the same account/server.
- **No device**: check that the phone is unlocked, the cable and USB data mode,
  trust and debugging settings, and the provider state.
- **Unauthorized/offline**: resolve the prompt on the phone or the physical
  connection, then rediscover. Don't keep re-running provisioning.
- **Install failure**: report the provider's error as given; check storage,
  compatibility, signing, and build mode.
- **Pairing invite expired**: the phone did not redeem the invite before it
  expired. Keep both devices awake, check connectivity, and retry the single
  provision call. Don't create an invite the agent can see.
- **Workspace preparation**: wait for or diagnose the workspace readiness
  status; a running process does not mean the workspace is ready.

For repository diagnostics, record the physical debug device's identity before
provisioning and use `mobile-debug.verifyWorkspaceReady` afterward. A hub device
ID is not an adb serial; keep them separate. Don't use the development extension
during normal onboarding.

If trusted desktop provisioning is unavailable, send the user to the shell's
Devices page and its pairing QR code. Don't break the automated operation into
manual hub-control or credential steps.
