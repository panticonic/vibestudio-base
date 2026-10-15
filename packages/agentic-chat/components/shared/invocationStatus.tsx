import { Box } from "@radix-ui/themes";
import {
  executionStatusLabel,
  executionStatusTone,
  getStatusColor,
  getStatusKey,
  isLiveStatus,
  type StatusKey,
  type StatusTone,
} from "@workspace/agentic-core/chat-presentation";

// The status vocabulary lives in @workspace/agentic-core/chat-presentation so
// every chat surface (including the terminal chat) shares it.
export {
  executionStatusLabel,
  executionStatusTone,
  getStatusColor,
  getStatusKey,
  isLiveStatus,
  type StatusKey,
  type StatusTone,
};

export function StatusDot({
  statusKey,
  tone,
}: {
  statusKey: StatusKey;
  tone?: StatusTone;
}) {
  return (
    <Box
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        backgroundColor: `var(--${tone ?? getStatusColor(statusKey)}-9)`,
        flexShrink: 0,
      }}
    />
  );
}
