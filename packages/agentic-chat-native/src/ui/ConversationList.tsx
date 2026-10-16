/** The conversation list: this workspace's chats, with the open chat's forks and parent. */
import type { ConversationRow } from "../model/conversation-list.js";
import { useSkin } from "@workspace/quickfire-core/ui";

export interface ConversationListProps {
  rows: readonly ConversationRow[];
  loading: boolean;
  error: string | null;
  onOpen: (row: ConversationRow) => void;
  onNew: () => void;
  onRetry: () => void;
}

const KIND_LABEL: Record<ConversationRow["kind"], string | null> = {
  conversation: null,
  fork: "Fork",
  parent: "Forked from",
};

export function ConversationList({
  rows,
  loading,
  error,
  onOpen,
  onNew,
  onRetry,
}: ConversationListProps) {
  const { Box, Text, Pressable, Pill, Spinner, Divider } = useSkin();
  return (
    <Box gap="md" pad="md" testId="chat-conversation-list">
      <Pressable variant="primary" tone="accent" label="New chat" onPress={onNew}>
        <Text variant="strong" tone="accent">
          New chat
        </Text>
      </Pressable>
      {loading ? <Spinner /> : null}
      {error ? (
        <Box surface="sunken" tone="danger" pad="sm" gap="sm">
          <Text tone="danger">{error}</Text>
          <Pressable label="Retry loading conversations" onPress={onRetry}>
            <Text variant="caption" tone="accent">
              Retry
            </Text>
          </Pressable>
        </Box>
      ) : null}
      {rows.map((row) => (
        <Box key={row.channelId} gap="xs">
          <Pressable
            label={`${KIND_LABEL[row.kind] ? `${KIND_LABEL[row.kind]}: ` : ""}${row.title}${row.current ? ", open" : ""}`}
            onPress={() => onOpen(row)}
          >
            <Box row gap="sm" align="center" grow>
              <Text variant={row.current ? "strong" : "body"} clamp>
                {row.title}
              </Text>
              {KIND_LABEL[row.kind] ? <Pill tone="info">{KIND_LABEL[row.kind]}</Pill> : null}
              {row.unread ? <Pill tone="accent">New</Pill> : null}
            </Box>
          </Pressable>
          <Divider />
        </Box>
      ))}
      {!loading && !error && rows.length === 0 ? (
        <Text tone="muted">No conversations yet.</Text>
      ) : null}
    </Box>
  );
}
