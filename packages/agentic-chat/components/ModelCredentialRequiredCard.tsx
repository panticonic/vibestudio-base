import {
  modelProviderLabel,
  getProviderConnectPreset,
} from "@workspace/model-catalog/providerConnect";
import { useEffect, useRef, useState } from "react";
import { Box, Button, Callout, Card, Code, Flex, Spinner, Text, TextField } from "@radix-ui/themes";
import { getVibestudioHostPlatform } from "@workspace/react/responsive";

interface CredentialFlow {
  type?: string;
}

interface ProviderOption {
  providerId: string;
  providerLabel?: string;
  modelRef?: string;
  modelName?: string;
  modelBaseUrl?: string;
  flow?: CredentialFlow;
}

interface ModelCredentialRequiredCardProps {
  providerId?: string;
  modelRef?: string;
  modelBaseUrl?: string;
  flow?: CredentialFlow;
  credentialLabel?: string;
  providerOptions?: ProviderOption[];
  agentParticipantId?: string;
  browserHandoffCallerId?: string;
  browserHandoffCallerKind?: string;
  /** Panel-owned persistence of the chosen agent model; absent when unavailable. */
  persistAgentModel?: (participantId: string, model: string) => Promise<void>;
  reason?: string;
  configuration?: Record<string, string>;
  method?: string;
  diagnosticReason?: string;
  failureCode?: string;
}

interface ChatApi {
  callMethod: (participantId: string, method: string, args: unknown) => Promise<unknown>;
}

export default function ModelCredentialRequiredCard({
  props = {},
  chat,
  onConnect,
}: {
  props?: ModelCredentialRequiredCardProps;
  chat?: ChatApi;
  onConnect?: (
    modelRef: string,
    method: string,
    browser: "internal" | "external",
    signal: AbortSignal,
    configuration?: Record<string, string>,
  ) => Promise<void>;
}) {
  const providerId = props.providerId ?? "";
  const currentModelRef = typeof props.modelRef === "string" ? props.modelRef : "";
  const fallbackOption: ProviderOption = {
    providerId,
    providerLabel: providerId,
    modelRef: currentModelRef,
    modelName: currentModelRef || providerId,
    modelBaseUrl: props.modelBaseUrl,
    flow: props.flow,
  };
  const providerOptions =
    Array.isArray(props.providerOptions) && props.providerOptions.length > 0
      ? props.providerOptions
      : [fallbackOption];
  const [selectedModelRef, setSelectedModelRef] = useState(
    providerOptions[0]?.modelRef || currentModelRef || providerId,
  );
  const selectedOption =
    providerOptions.find((option) => option.modelRef === selectedModelRef) ??
    providerOptions[0] ??
    fallbackOption;
  const selectedProviderId = selectedOption.providerId || providerId;
  const selectedModelBaseUrl = selectedOption.modelBaseUrl || props.modelBaseUrl;
  const definition = getProviderConnectPreset(selectedProviderId);
  const methods = definition?.methods ?? [];
  const [configuration, setConfiguration] = useState<Record<string, string>>(
    props.configuration ?? {},
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string | undefined>(props.method);
  const selectedMethod = methods.find((method) => method.id === selectedMethodId) ?? methods[0];
  const selectedFlow = selectedMethod?.flow ?? selectedOption.flow ?? props.flow;
  const reconnectReason =
    typeof props.reason === "string" && props.reason.trim() ? props.reason : "";
  const diagnosticReason =
    typeof props.diagnosticReason === "string" && props.diagnosticReason.trim()
      ? props.diagnosticReason
      : "";
  const failureCode =
    typeof props.failureCode === "string" && props.failureCode.trim() ? props.failureCode : "";
  const [status, setStatus] = useState<"idle" | "starting" | "waiting" | "done" | "error">("idle");
  const [activeOpenMode, setActiveOpenMode] = useState<"internal" | "external" | null>(null);
  const [error, setError] = useState("");

  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const startCredential = async (openMode: "internal" | "external") => {
    if (!selectedFlow) return;
    setStatus("starting");
    setActiveOpenMode(openMode);
    setError("");
    const controller = new AbortController();
    operation.current = controller;
    try {
      if (onConnect) {
        await onConnect(
          selectedOption.modelRef ?? currentModelRef,
          selectedMethod!.id,
          openMode,
          controller.signal,
          configuration,
        );
        if (!controller.signal.aborted && operation.current === controller) setStatus("done");
        return;
      }
      if (!chat || !props.agentParticipantId) {
        throw new Error("Missing agent participant for credential setup");
      }
      if (selectedOption.modelRef && selectedOption.modelRef !== currentModelRef) {
        await chat.callMethod(props.agentParticipantId, "setModel", {
          model: selectedOption.modelRef,
        });
        if (props.persistAgentModel) {
          void props
            .persistAgentModel(props.agentParticipantId, selectedOption.modelRef)
            .catch((err: unknown) => {
              console.warn("[ModelCredentialRequiredCard] model persistence failed:", err);
            });
        }
      }
      setStatus("waiting");
      const connected = await chat.callMethod(props.agentParticipantId, "connectModelCredential", {
        providerId: selectedProviderId,
        configuration,
        ...(selectedMethodId ? { method: selectedMethod?.id } : {}),
        modelBaseUrl: selectedModelBaseUrl,
        modelRef: selectedOption.modelRef,
        browserOpenMode: openMode,
        browserHandoffCallerId: props.browserHandoffCallerId,
        browserHandoffCallerKind: props.browserHandoffCallerKind,
      });
      if (connected && typeof connected === "object") {
        const response = connected as {
          isError?: boolean;
          error?: string;
          result?: { error?: string };
        };
        if (response.isError || response.error || response.result?.error)
          throw new Error(
            response.error ?? response.result?.error ?? "Provider connection failed. Try again.",
          );
      }
      if (operation.current === controller) setStatus("done");
    } catch (err) {
      if (operation.current !== controller) return;
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setActiveOpenMode(null);
      }
    }
  };

  const busy = status === "starting" || status === "waiting";
  const workspaceBrowserAvailable = getVibestudioHostPlatform() !== "mobile";
  const needsDesktop =
    !workspaceBrowserAvailable && selectedMethod?.redirectPolicy === "loopback-required";
  const unsupported = !selectedFlow;
  const apiKeyFlow = selectedFlow?.type === "api-key";
  const internalBrowserLabel = reconnectReason
    ? "Refresh in workspace browser"
    : "Use workspace browser";
  const externalBrowserLabel = reconnectReason ? "Refresh in system browser" : "Use system browser";
  const apiKeyButtonLabel =
    status === "done"
      ? "Connected"
      : status === "error"
        ? "Try Again"
        : reconnectReason
          ? "Update API Key"
          : "Enter API Key";

  return (
    <Card
      className="agent-provider-connect"
      variant="surface"
      size="1"
      role="region"
      aria-label="Connect a model provider"
    >
      <Flex direction="column" gap="2">
        <Box>
          <Text as="div" size="2" weight="medium">
            {reconnectReason ? "Reconnect " : "Connect "}
            {modelProviderLabel(selectedProviderId)}
          </Text>
        </Box>
        {providerOptions.length > 1 ? (
          <Flex direction="column" gap="1">
            {providerOptions.map((option) => {
              const selected = option.modelRef === selectedOption.modelRef;
              return (
                <Button
                  key={option.modelRef || option.providerId}
                  type="button"
                  size="1"
                  variant={selected ? "solid" : "soft"}
                  color={selected ? undefined : "gray"}
                  onClick={() => {
                    setSelectedModelRef(option.modelRef || option.providerId);
                    setSelectedMethodId(undefined);
                    setConfiguration({});
                    setError("");
                    setActiveOpenMode(null);
                    setStatus("idle");
                  }}
                  disabled={busy}
                  style={{ justifyContent: "flex-start" }}
                >
                  <Text size="1" weight="medium">
                    {option.providerLabel || option.providerId}
                  </Text>
                  <Text size="1" color={selected ? undefined : "gray"}>
                    {option.modelName || option.modelRef}
                  </Text>
                </Button>
              );
            })}
          </Flex>
        ) : null}
        {definition?.configuration?.map((field) => (
          <label key={field.name}>
            <Text size="1" as="div">
              {field.label}
            </Text>
            <TextField.Root
              aria-label={field.label}
              placeholder={field.placeholder}
              value={configuration[field.name] ?? ""}
              disabled={busy}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  [field.name]: event.target.value,
                })
              }
            />
          </label>
        ))}
        {methods.length > 1 ? (
          <Flex gap="2" wrap="wrap" aria-label="Sign-in method">
            {methods.map((method) => (
              <Button
                key={method.id}
                size="1"
                disabled={busy}
                aria-pressed={method.id === selectedMethod?.id}
                variant={method.id === selectedMethod?.id ? "solid" : "soft"}
                onClick={() => {
                  setSelectedMethodId(method.id);
                  setStatus("idle");
                  setError("");
                }}
              >
                {method.label}
              </Button>
            ))}
          </Flex>
        ) : null}
        {reconnectReason ? (
          <Callout.Root color="amber" size="1">
            <Callout.Text>{reconnectReason}</Callout.Text>
          </Callout.Root>
        ) : null}
        {diagnosticReason || failureCode ? (
          <Box>
            <Text as="div" size="1" color="gray">
              Diagnostic
            </Text>
            <Code size="1">
              {failureCode ? `${failureCode}: ` : ""}
              {diagnosticReason || "No provider details available."}
            </Code>
          </Box>
        ) : null}
        {unsupported ? (
          <Callout.Root color="amber" size="1">
            <Callout.Text>No built-in setup is available for this model provider.</Callout.Text>
          </Callout.Root>
        ) : null}
        {status === "done" ? (
          <Callout.Root color="green" size="1">
            <Callout.Text>
              {onConnect
                ? "Provider connected. You can start chatting."
                : "Provider connected. Continuing…"}
            </Callout.Text>
          </Callout.Root>
        ) : null}
        {busy ? (
          <Text size="1" role="status">
            {apiKeyFlow
              ? "Complete the secure key entry prompt."
              : "Finish signing in in your browser. For device sign-in, use the code shown in the approval bar."}
          </Text>
        ) : null}
        {busy && onConnect ? (
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => {
              operation.current?.abort();
              operation.current = null;
              setStatus("idle");
            }}
          >
            Cancel sign-in
          </Button>
        ) : null}
        {error ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        ) : null}
        {needsDesktop ? (
          <Callout.Root color="amber" size="1">
            <Callout.Text>
              This subscription sign-in requires a desktop browser. Connect this provider on
              desktop, or choose an API key if available.
            </Callout.Text>
          </Callout.Root>
        ) : apiKeyFlow ? (
          <Flex gap="2" wrap="wrap">
            <Button
              size="1"
              onClick={() => void startCredential("internal")}
              disabled={busy || unsupported || status === "done"}
            >
              {busy ? <Spinner size="1" /> : null}
              {apiKeyButtonLabel}
            </Button>
          </Flex>
        ) : (
          <Flex gap="2" wrap="wrap" align="center">
            {workspaceBrowserAvailable ? (
              <Button
                size="1"
                title="Sign in using the browser inside this workspace."
                onClick={() => void startCredential("internal")}
                disabled={busy || unsupported || status === "done"}
              >
                {busy && activeOpenMode === "internal" ? <Spinner size="1" /> : null}
                {internalBrowserLabel}
              </Button>
            ) : null}
            <Button
              size="1"
              variant="soft"
              title="Sign in using your regular browser."
              onClick={() => void startCredential("external")}
              disabled={busy || unsupported || status === "done"}
            >
              {busy && activeOpenMode === "external" ? <Spinner size="1" /> : null}
              {externalBrowserLabel}
            </Button>
            <details className="agent-config-details">
              <summary>Sign-in help</summary>
              <Text as="p" size="1" color="gray">
                Choose the browser with the account you want to use, or sign in to either. Your
                credentials stay in the secure credential store.
              </Text>
            </details>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
