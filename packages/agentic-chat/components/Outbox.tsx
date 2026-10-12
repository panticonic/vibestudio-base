import React, { useCallback, useMemo, useState } from "react";
import { Box, Button, Flex, IconButton, ScrollArea, Text } from "@radix-ui/themes";
import { ChevronDownIcon, ChevronUpIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { useIsMobile, useTouchDevice } from "@workspace/react/responsive";
import { useChatContext } from "../context/ChatContext";
import { OutboxItem, type OutboxLane } from "./OutboxItem";

import {
  deriveActiveOutbox,
  deriveOutboxMessages,
  hasOfflinePendingRecipient,
} from "@workspace/agentic-core/chat-presentation";

export { deriveActiveOutbox, deriveOutboxMessages, hasOfflinePendingRecipient };

/**
 * The outbox — an "on-deck" tray between the feedback area and the composer.
 * Visualizes now-vs-next, pre-explains the flush priority, and tethers to the
 * agent's typing indicator while a turn is in flight. Mobile collapses to a
 * one-line summary bar; the queue caps height with internal scroll so the
 * composer stays visible. Stays below the mention popover z-layer.
 */
export const Outbox = React.memo(function Outbox() {
  const {
    connected,
    messages,
    selfId,
    participants,
    allParticipants,
    agentBusy,
    editPendingMessage,
    cancelPendingMessage,
    flushOutboxAndInterrupt,
    afterTurnMessageIds,
  } = useChatContext();
  const isMobile = useIsMobile();
  const isTouch = useTouchDevice();
  const touch = isMobile || isTouch;

  const [collapsed, setCollapsed] = useState(true);

  // Offline-recipient messages move to the transcript (with a marker), not the
  // outbox, so the outbox stays the actively-deliverable queue.
  const derived = useMemo(
    () => deriveActiveOutbox(messages, selfId, participants),
    [messages, selfId, participants]
  );

  const items = derived;

  const laneFor = useCallback(
    (id: string): OutboxLane => {
      if (afterTurnMessageIds?.has(id)) return "after-turn";
      return agentBusy ? "steer" : "send";
    },
    [afterTurnMessageIds, agentBusy]
  );

  // Suppress the queue until the channel is connected (replay complete — the
  // ConnectionManager only reports "connected" after `client.ready()`). During
  // the initial replay, historical self-messages are folded BEFORE their
  // read-acks, so they transiently look pending and the iris-accented queue
  // would flash into view before settling. No queue exists while disconnected
  // anyway (nothing can be flushed), so this is purely correct.
  if (!connected) return null;
  if (items.length === 0) return null;

  const summary = `${items.length} unsent`;
  const steerCount = items.filter((m) => laneFor(m.id) === "steer").length;
  const showAsCollapsed = touch && collapsed && items.length > 0;

  const itemList = (
    <Flex
      direction="column"
      gap="2"
      role="list"
      aria-label="Outbox — your unsent messages"
      className="outbox-list"
    >
      {items.map((m) => (
        <OutboxItem
          key={m.id}
          msg={m}
          participants={allParticipants}
          lane={laneFor(m.id)}
          touch={touch}
          onEdit={editPendingMessage}
          onCancel={cancelPendingMessage}
        />
      ))}
    </Flex>
  );

  return (
    <Box
      className={`outbox-root${agentBusy ? " outbox-tethered" : ""}`}
      flexShrink="0"
      data-testid="outbox"
    >
      {/* Quiet tether between the typing indicator and the outbox. */}
      {agentBusy && <Box className="outbox-tether" aria-hidden="true" />}
      {showAsCollapsed ? (
        <button
          type="button"
          className="outbox-summary-bar app-touch-target"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          aria-label={`${summary}. Tap to expand.`}
        >
          <Flex align="center" justify="between" gap="2" style={{ width: "100%" }}>
            <Text size="2" weight="medium">
              {summary}
            </Text>
            <Flex align="center" gap="2">
              {steerCount > 0 && (
                <Text size="1" color="iris">
                  {steerCount} lands this turn
                </Text>
              )}
              <ChevronUpIcon />
            </Flex>
          </Flex>
        </button>
      ) : (
        <Box className="outbox-panel">
          {touch && (
            <Flex align="center" justify="between" gap="2" className="outbox-panel-header">
              <Text size="2" weight="medium">
                {summary}
              </Text>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="Collapse outbox"
                onClick={() => setCollapsed(true)}
              >
                <ChevronDownIcon />
              </IconButton>
            </Flex>
          )}
          {/* Radix ScrollArea (same as the transcript) for the polished thin
              scrollbar instead of the browser's default chunky one. */}
          <ScrollArea className="outbox-scroll" scrollbars="vertical" size="1">
            {itemList}
          </ScrollArea>
          {/* Flush control lives at the foot of the queue and names its effect:
              while an agent is mid-turn it interrupts to deliver now; otherwise
              it just sends the queue. (Esc flushes too — see useChatCore.) */}
          <Button
            className="outbox-flush app-touch-target"
            size="2"
            variant="soft"
            color="iris"
            mt="2"
            style={{ width: "100%" }}
            onClick={() => void flushOutboxAndInterrupt()}
          >
            <LightningBoltIcon />
            {agentBusy ? "Send now & interrupt" : "Send now"}
          </Button>
        </Box>
      )}
    </Box>
  );
});

