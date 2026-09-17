import { useEffect, useRef, useState } from "react";
import { Button, Flex, Heading, Select, Spinner, Text } from "@radix-ui/themes";
import {
  PhoneProvisioningResultSchema,
  type PhoneDevice,
  type PhoneProvider,
  type PhoneProvisioningResult,
} from "@vibestudio/service-schemas/phoneProvisioning";
import { phoneSetup } from "./index.js";

type Phase =
  | "idle"
  | "preparing-tools"
  | "checking-device"
  | "installing"
  | "pairing"
  | "opening"
  | "ready";
const steps = [
  "Prepare tools",
  "Choose phone",
  "Install app",
  "Pair securely",
  "Open workspace",
];
const stepIndex: Record<Phase, number> = {
  idle: 0,
  "preparing-tools": 0,
  "checking-device": 1,
  installing: 2,
  pairing: 3,
  opening: 4,
  ready: 5,
};

export default function PhoneSetup({
  scope = {},
}: {
  scope?: Record<string, unknown>;
}) {
  const saved = PhoneProvisioningResultSchema.safeParse(
    scope["phoneSetupPaired"],
  );
  const [paired, setPaired] = useState<PhoneProvisioningResult | null>(
    saved.success ? saved.data : null,
  );
  const [providers, setProviders] = useState<PhoneProvider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [devices, setDevices] = useState<PhoneDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [phase, setPhase] = useState<Phase>(paired ? "opening" : "idle");
  const [message, setMessage] = useState(
    paired
      ? "Phone paired. Check whether your workspace is ready."
      : "Connect and unlock your phone. Android tools can be prepared automatically on your desktop.",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const client = useRef<ReturnType<typeof phoneSetup> | null>(null);
  const getClient = () =>
    (client.current ??= phoneSetup().catch((error) => {
      client.current = null;
      throw error;
    }));
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const loadProviders = async () => {
    const available = await (await getClient()).providers();
    setProviders(available);
    if (available.length === 1) setProviderId(available[0]!.providerId);
    if (!available.length)
      setMessage(
        "Open the Vibestudio desktop app on the same account, then check again.",
      );
  };
  useEffect(() => {
    void run(loadProviders);
  }, []);
  const discover = async () => {
    const api = await getClient();
    setPhase("preparing-tools");
    setMessage(
      "Preparing verified phone tools on your desktop. The first download may take a minute…",
    );
    await api.prepare(providerId, platform);
    setPhase("checking-device");
    setMessage("Checking connected phones…");
    const found = await api.devices(providerId, platform);
    setDevices(found.devices);
    const ready = found.devices.filter((device) => device.ready);
    setDeviceId(ready.length === 1 ? ready[0]!.deviceId : "");
    setMessage(
      found.issues.length
        ? found.issues
            .map((issue) =>
              [issue.message, issue.action].filter(Boolean).join(" "),
            )
            .join("\n")
        : ready.length
          ? "Choose your phone, then install and connect it."
          : found.devices.some((device) => device.state === "unauthorized")
            ? "Unlock your phone and accept the USB debugging prompt, then check again."
            : found.devices.length
              ? "Wait for the phone or emulator to finish starting. If it stays offline, reconnect it and check again."
              : platform === "android"
                ? "No phone found. Use a data-capable USB cable and enable USB debugging in Developer options, then check again."
                : "Connect and unlock your iPhone, trust this Mac, and enable Developer Mode if asked. Xcode and signing are required for installation.",
    );
  };
  const checkWorkspace = async (result: PhoneProvisioningResult) => {
    setPhase("opening");
    setMessage("Phone paired. Opening your workspace…");
    const readiness = await (
      await getClient()
    ).waitForWorkspace(result, setMessage);
    setMessage(readiness.message);
    if (readiness.status === "ready") setPhase("ready");
    else if (readiness.status === "failed") setError(readiness.message);
    else
      setMessage(
        "Your phone is paired, but the workspace is still opening. Keep it awake, respond to any approvals there, then check again.",
      );
  };
  const install = async () => {
    const result = await (
      await getClient()
    ).provision({ providerId, platform, deviceId }, (event) => {
      if (event.type === "progress") {
        setPhase(event.phase);
        setMessage(event.message);
      }
      if (event.type === "paired") {
        setPaired(event.result);
        scope["phoneSetupPaired"] = event.result;
      }
    });
    setPaired(result);
    scope["phoneSetupPaired"] = result;
    await checkWorkspace(result);
  };
  const resetSelection = () => {
    setDevices([]);
    setDeviceId("");
    setPhase("idle");
    setError(null);
  };
  return (
    <Flex
      direction="column"
      gap="3"
      p="2"
      style={{ width: "100%", minWidth: 0 }}
    >
      <Heading size="3">Set up your phone</Heading>
      <Flex wrap="wrap" gap="2" aria-label="Setup progress">
        {steps.map((step, index) => (
          <Text
            key={step}
            size="1"
            weight={index === stepIndex[phase] ? "bold" : "regular"}
            color={index < stepIndex[phase] ? "green" : "gray"}
          >
            {index < stepIndex[phase] ? "✓" : `${index + 1}.`} {step}
          </Text>
        ))}
      </Flex>
      {!paired && (
        <Flex direction="column" gap="2">
          <Text size="2" as="label">
            Desktop
            <Select.Root
              value={providerId}
              onValueChange={(id) => {
                setProviderId(id);
                if (
                  !providers
                    .find((provider) => provider.providerId === id)
                    ?.platforms.includes(platform)
                )
                  setPlatform("android");
                resetSelection();
              }}
              disabled={busy}
            >
              <Select.Trigger
                placeholder="Choose a connected desktop"
                style={{ width: "100%" }}
              />
              <Select.Content>
                {providers.map((provider) => (
                  <Select.Item
                    key={provider.providerId}
                    value={provider.providerId}
                  >
                    {provider.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Text>
          <Text size="2" as="label">
            Phone type
            <Select.Root
              value={platform}
              onValueChange={(value) => {
                setPlatform(value as "android" | "ios");
                resetSelection();
              }}
              disabled={busy}
            >
              <Select.Trigger style={{ width: "100%" }} />
              <Select.Content>
                <Select.Item value="android">Android</Select.Item>
                <Select.Item
                  value="ios"
                  disabled={
                    !providers
                      .find((p) => p.providerId === providerId)
                      ?.platforms.includes("ios")
                  }
                >
                  iPhone (requires a Mac)
                </Select.Item>
              </Select.Content>
            </Select.Root>
          </Text>
          {devices.length > 0 && (
            <Text size="2" as="label">
              Phone
              <Select.Root
                value={deviceId}
                onValueChange={setDeviceId}
                disabled={busy}
              >
                <Select.Trigger
                  placeholder="Choose a phone"
                  style={{ width: "100%" }}
                />
                <Select.Content>
                  {devices.map((device) => (
                    <Select.Item
                      key={device.deviceId}
                      value={device.deviceId}
                      disabled={!device.ready}
                    >
                      {device.name ??
                        (device.kind === "emulator"
                          ? "Android emulator"
                          : "Phone")}{" "}
                      · {device.deviceId.slice(-8)}
                      {device.ready ? "" : ` · ${device.state}`}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Text>
          )}
        </Flex>
      )}
      <Flex align="start" gap="2" role="status" aria-live="polite">
        {busy && <Spinner />}
        <Text
          as="p"
          size="2"
          style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
        >
          {message}
        </Text>
      </Flex>
      {error && (
        <Text
          as="p"
          size="2"
          color="red"
          role="alert"
          style={{ overflowWrap: "anywhere" }}
        >
          {error}
        </Text>
      )}
      <Flex wrap="wrap" gap="2">
        {!paired && (
          <>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => void run(loadProviders)}
            >
              Refresh desktops
            </Button>
            <Button
              variant="soft"
              disabled={busy || !providerId}
              onClick={() => void run(discover)}
            >
              {phase === "idle"
                ? "Prepare tools and find phones"
                : "Check phones again"}
            </Button>
            {deviceId && (
              <Button disabled={busy} onClick={() => void run(install)}>
                {error
                  ? "Retry installation and pairing"
                  : "Install and connect"}
              </Button>
            )}
          </>
        )}
        {paired && phase !== "ready" && (
          <Button
            disabled={busy}
            onClick={() => void run(() => checkWorkspace(paired))}
          >
            Check workspace
          </Button>
        )}
        {paired && phase === "ready" && (
          <Button
            variant="soft"
            disabled={busy}
            onClick={() => {
              delete scope["phoneSetupPaired"];
              setPaired(null);
              resetSelection();
              setMessage("Connect another phone to get started.");
            }}
          >
            Set up another phone
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
