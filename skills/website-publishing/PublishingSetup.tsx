import { useEffect, useState } from "react";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { ExternalLinkIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { credentials, openExternal } from "@workspace/runtime";
import {
  connectPublishingProvider,
  type PublishingProvider,
} from "./setup.js";

interface PublishingSetupProps {
  props: { provider: PublishingProvider };
  chat: {
    send(
      content: string,
      options?: { metadata?: Record<string, unknown> },
    ): Promise<unknown>;
  };
}

const providers = {
  vercel: {
    title: "Vercel",
    tokenUrl: "https://vercel.com/account/settings/tokens",
    tokenHelp:
      "Create an access token in Vercel, then return here to store it securely.",
    targetId: "connection.vercel-publishing",
  },
  "cloudflare-pages": {
    title: "Cloudflare Pages",
    tokenUrl: "https://dash.cloudflare.com/profile/api-tokens",
    tokenHelp:
      "Create a Cloudflare API token with Pages edit access, then return here to store it securely.",
    targetId: "connection.cloudflare-pages",
  },
} as const;

export default function PublishingSetup({ props, chat }: PublishingSetupProps) {
  const provider = providers[props.provider];
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<"open" | "connect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void credentials.listStoredCredentials().then((stored) => {
      if (!active) return;
      setConnected(
        stored.some(
          (credential) =>
            !credential.revokedAt &&
            credential.metadata?.["providerId"] === props.provider,
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [props.provider]);

  async function run(
    action: "open" | "connect",
    operation: () => Promise<void>,
  ): Promise<void> {
    setBusy(action);
    setMessage(null);
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  function openTokenPage(): void {
    void run("open", async () => {
      await openExternal(provider.tokenUrl);
      setMessage(`${provider.title} token settings opened in your browser.`);
    });
  }

  function connect(): void {
    void run("connect", async () => {
      await connectPublishingProvider(props.provider, credentials);
      setConnected(true);
      setMessage(`${provider.title} publishing is connected.`);
      try {
        await chat.send(
          `${provider.title} publishing setup succeeded. Refresh the onboarding snapshot.`,
          {
            metadata: {
              interaction: {
                source: "onboarding-setup-hub",
                kind: "onboarding-capability",
                action: "check",
                targetId: provider.targetId,
              },
            },
          },
        );
      } catch {
        // The host already stored the credential. A chat refresh failure does
        // not turn a successful connection into a failed one.
      }
    });
  }

  return (
    <Flex direction="column" gap="4" p="2" style={{ width: "100%", minWidth: 0 }}>
      <Box>
        <Heading size="4">Connect {provider.title}</Heading>
        <Text as="div" size="2" color="gray">
          {provider.tokenHelp}
        </Text>
      </Box>

      {connected ? (
        <Box
          style={{
            border: "1px solid var(--green-6)",
            borderRadius: 8,
            padding: 12,
            background: "var(--green-2)",
          }}
        >
          <Text size="2" weight="bold">
            Connected for publishing
          </Text>
        </Box>
      ) : null}

      <Flex gap="2" wrap="wrap">
        <Button variant="soft" disabled={busy !== null} onClick={openTokenPage}>
          <ExternalLinkIcon />
          {busy === "open" ? "Opening…" : `Open ${provider.title} token settings`}
        </Button>
        <Button disabled={busy !== null} onClick={connect}>
          <LockClosedIcon />
          {busy === "connect"
            ? "Opening secure input…"
            : connected
              ? "Replace publishing token"
              : "Save publishing token"}
        </Button>
      </Flex>

      <Text size="1" color="gray">
        The token goes directly to Vibestudio’s trusted credential store.
        Workspace code receives only a credential ID and uses the reviewed
        publishing channel.
      </Text>
      {message ? (
        <Text
          size="1"
          color={
            message.includes("connected") || message.includes("opened")
              ? "gray"
              : "red"
          }
        >
          {message}
        </Text>
      ) : null}
    </Flex>
  );
}
