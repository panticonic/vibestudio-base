import { Box, Button, Callout, Flex, IconButton, Text } from "@radix-ui/themes";
import { Cross1Icon, ExclamationTriangleIcon, InfoCircledIcon, ReloadIcon } from "@radix-ui/react-icons";
import { useChatContext } from "../context/ChatContext";
import { pendingReviewNotice } from "@vibestudio/shared/authority/reviewPending";

/**
 * Exposes the channel connection status on the rendered chat as a hidden
 * marker. "connected" means the subscription — including this participant's
 * advertised methods — is established, so an observer driving the rendered
 * panel (a system test) can wait for membership without the presence stream.
 */
export function ChatConnectionStateMarker() {
  const { connected } = useChatContext();
  return <span hidden data-chat-connection={connected ? "connected" : "disconnected"} />;
}

/**
 * Renders a dismissible banner at the top of the chat whenever the session has
 * surfaced a failure the user should see. The copy says what happened and the
 * next step; the original technical text is behind a "Details" disclosure.
 *
 * Cleared automatically on successful (re)connect; also dismissible by the
 * user. Retry is offered when rejoining the conversation can help.
 */
export function ChatConnectionErrorBanner() {
  const { connectionError, dismissConnectionError, retryConnection } = useChatContext();
  if (!connectionError) return null;
  const pending = pendingReviewNotice(connectionError.cause ?? connectionError);
  const color: "amber" | "red" = pending ? "amber" : "red";
  const title = pending
    ? "Workspace setup is waiting for your review"
    : (connectionError.title ?? "Something went wrong");
  const message = pending ? pending.message : connectionError.message;
  const detail = pending ? undefined : connectionError.detail;
  const canRetry = !pending && connectionError.retryable !== false && Boolean(retryConnection);

  return (
    <Box px="1" flexShrink="0" style={{ maxWidth: "100%", overflow: "hidden" }}>
      <Callout.Root
        color={color}
        size="1"
        variant="surface"
        role={pending ? "status" : "alert"}
        data-part="connection-error"
        style={{ maxWidth: "100%", boxSizing: "border-box" }}
      >
        <Callout.Icon>
          {pending ? <InfoCircledIcon /> : <ExclamationTriangleIcon />}
        </Callout.Icon>
        <Flex align="center" justify="between" gap="2" width="100%" style={{ minWidth: 0 }}>
          <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
            <Text size="1" weight="medium">
              {title}
            </Text>
            <Text size="1" style={WRAP}>
              {message}
            </Text>
            {detail && detail !== message ? (
              <details>
                <summary>
                  <Text size="1" color="gray">
                    Details
                  </Text>
                </summary>
                <Text size="1" color="gray" style={{ ...WRAP, fontFamily: "var(--code-font-family)" }}>
                  {detail}
                </Text>
              </details>
            ) : null}
          </Flex>
          {canRetry ? (
            <Button size="1" variant="soft" color={color} onClick={retryConnection}>
              <ReloadIcon /> Retry
            </Button>
          ) : null}
          {dismissConnectionError && (
            <IconButton
              size="1"
              variant="ghost"
              color={color}
              onClick={dismissConnectionError}
              aria-label={pending ? "Dismiss workspace review notice" : "Dismiss this message"}
              style={{ flexShrink: 0 }}
            >
              <Cross1Icon />
            </IconButton>
          )}
        </Flex>
      </Callout.Root>
    </Box>
  );
}

const WRAP = {
  display: "block",
  maxWidth: "100%",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} as const;
