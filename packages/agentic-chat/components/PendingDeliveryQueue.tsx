import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  IconButton,
  Spinner,
  Text,
} from "@radix-ui/themes";
import {
  Cross2Icon,
  ExclamationTriangleIcon,
  ImageIcon,
  LightningBoltIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { isAgentParticipantType } from "@workspace/pubsub";
import { isModelAgentLaunchable } from "@workspace/model-catalog/catalog";
import {
  launchStageLabel,
  type PendingDelivery,
  type UserFacingError,
} from "@workspace/agentic-core/chat-store";
import { useChatContext } from "../context/ChatContext";

/** A failure: what happened and the next step, with the technical cause behind a disclosure. */
function FailureDetails({ failure }: { failure: UserFacingError }) {
  return (
    <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
      <Text size="1" color="red" weight="medium">
        {failure.title}
      </Text>
      <Text size="1" color="gray">
        {failure.message}
      </Text>
      {failure.detail ? (
        <details className="pending-delivery-details">
          <summary>
            <Text size="1" color="gray">
              Details
            </Text>
          </summary>
          <Text size="1" color="gray" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {failure.detail}
          </Text>
        </details>
      ) : null}
    </Flex>
  );
}

function itemLabel(item: PendingDelivery): string {
  const attachmentCount = item.attachments?.length ?? 0;
  return (
    item.text ||
    (attachmentCount > 0 ? `${attachmentCount} image${attachmentCount > 1 ? "s" : ""}` : "")
  );
}

/**
 * Pre-send delivery queue — the messages the user sent before any agent existed.
 * They are held client-side (unsent) and flush LIVE once the spawned agent joins
 * the roster. A spinner + plain-language line explain the wait ("Launching
 * agent…"); if the launch fails, an error + Retry replaces the spinner. Each
 * item can be removed before it is delivered. Sits just above the composer, in
 * the slot the post-join Outbox uses (the two are never both non-empty).
 */
export function PendingDeliveryQueue() {
  const { deferredAgent, modelCatalog, participants } = useChatContext();
  if (!deferredAgent || deferredAgent.queued.length === 0) return null;
  const {
    queued,
    launching,
    launchFailed,
    launchStage,
    launchError,
    deliveringId,
    modelSelectionRequired,
    modelDiscoveryPending,
    retryLaunch,
    retryDelivery,
    cancelQueued,
    draft,
  } = deferredAgent;
  const discardQueued = deferredAgent.discardQueued ?? cancelQueued;
  const agentPresent = Object.values(participants).some((participant) => isAgentParticipantType(participant.metadata.type));
  const awaitingModelChoice =
    !agentPresent && modelSelectionRequired && !launching && !launchFailed;
  const deliveryPaused = queued.some((item) => item.status === "failed");
  const selectedModel = modelCatalog?.models.find(
    (model) => model.ref === draft.model,
  );
  const setupMessage =
    selectedModel?.availability.state === "downloading"
      ? `Installing ${selectedModel.name} — this sends when setup finishes.`
      : selectedModel?.availability.state === "starting"
        ? `Preparing ${selectedModel.name} — this sends when it is ready.`
        : selectedModel?.availability.state === "needs-setup" &&
            selectedModel.provider === "local"
          ? "Finish local model installation above — this stays queued."
          : isModelAgentLaunchable(selectedModel)
            ? `${selectedModel?.name ?? "Your model"} is ready — start your agent above.`
            : "Choose a model above — this sends when your agent starts.";

  return (
    <Box
      flexShrink="0"
      className="pending-delivery-root"
      data-testid="pending-delivery-queue"
    >
      <Card
        className={`chat-surface-card pending-delivery-card${launchFailed ? " pending-delivery-card-failed" : ""}`}
        size="1"
        variant="surface"
      >
        <Flex
          align="center"
          justify="between"
          gap="2"
          className="pending-delivery-header"
        >
          <Flex
            align="center"
            gap="2"
            style={{ minWidth: 0 }}
            role="status"
            aria-live="polite"
          >
            {deliveryPaused ? (
              <>
                <ExclamationTriangleIcon
                  style={{ color: "var(--red-9)", flexShrink: 0 }}
                />
                <Text size="1" color="red" weight="medium" truncate>
                  Delivery paused — a message below couldn't be sent.
                </Text>
              </>
            ) : launchFailed ? (
              <>
                <ExclamationTriangleIcon
                  style={{ color: "var(--red-9)", flexShrink: 0 }}
                />
                <Text size="1" color="red" weight="medium" truncate>
                  {launchError?.title ?? launchStageLabel("failed")} — these
                  send once it's running.
                </Text>
              </>
            ) : !agentPresent && modelDiscoveryPending ? (
              <>
                <Spinner size="1" />
                <Text size="1" color="gray" weight="medium" truncate>
                  Preparing model settings — your message will stay queued.
                </Text>
              </>
            ) : awaitingModelChoice ? (
              <>
                <LightningBoltIcon
                  style={{ color: "var(--accent-9)", flexShrink: 0 }}
                />
                <Text size="1" color="gray" weight="medium" truncate>
                  {setupMessage}
                </Text>
              </>
            ) : (
              <>
                <Spinner size="1" />
                <Text size="1" color="gray" weight="medium" truncate>
                  {agentPresent
                    ? "Sending queued messages"
                    : launchStage
                      ? `${launchStageLabel(launchStage)}…`
                      : "Your first message is waiting for an agent"}
                </Text>
              </>
            )}
          </Flex>
          {launchFailed && (
            <Button
              size="1"
              variant="soft"
              color="red"
              className="app-touch-target"
              onClick={retryLaunch}
            >
              <ReloadIcon />
              Retry
            </Button>
          )}
        </Flex>
        {launchFailed && launchError ? (
          <Box mt="2">
            <FailureDetails failure={launchError} />
          </Box>
        ) : null}
        <Flex
          direction="column"
          gap="1"
          mt="2"
          role="list"
          aria-label="Messages waiting for your agent"
          className="pending-delivery-list"
        >
          {queued.map((m) => {
            const attachmentCount = m.attachments?.length ?? 0;
            const failed = m.status === "failed" && m.failure;
            return (
              <Flex
                key={m.id}
                role="listitem"
                direction="column"
                gap="1"
                className="pending-delivery-item"
                data-status={m.status}
              >
                <Flex align="center" justify="between" gap="2">
                  <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                    {m.tier === "secondary" && (
                      <Badge
                        size="1"
                        variant="soft"
                        color="gray"
                        style={{ flexShrink: 0 }}
                      >
                        First message
                      </Badge>
                    )}
                    {attachmentCount > 0 && (
                      <ImageIcon
                        style={{ flexShrink: 0, color: "var(--gray-9)" }}
                      />
                    )}
                    <Text size="2" truncate className="pending-delivery-text">
                      {itemLabel(m)}
                    </Text>
                  </Flex>
                  <Flex align="center" gap="1" style={{ flexShrink: 0 }}>
                    {failed ? (
                      <Button
                        size="1"
                        variant="soft"
                        className="app-touch-target"
                        onClick={() => retryDelivery(m.id)}
                      >
                        <ReloadIcon />
                        Retry
                      </Button>
                    ) : null}
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="gray"
                      className="app-touch-target"
                      aria-label={failed ? "Discard message" : "Remove queued message"}
                      title={
                        deliveringId === m.id
                          ? "Sending this message"
                          : failed
                            ? "Discard without sending"
                            : "Remove before it sends"
                      }
                      disabled={deliveringId === m.id}
                      onClick={() => discardQueued(m.id)}
                    >
                      <Cross2Icon />
                    </IconButton>
                  </Flex>
                </Flex>
                {failed ? (
                  <Box role="alert">
                    <FailureDetails failure={m.failure!} />
                  </Box>
                ) : m.status === "waiting" ? (
                  <Text size="1" color="gray">
                    Waiting for the message above
                  </Text>
                ) : null}
              </Flex>
            );
          })}
        </Flex>
      </Card>
    </Box>
  );
}
