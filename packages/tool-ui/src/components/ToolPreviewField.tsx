/**
 * ToolPreviewField Component
 *
 * Renders tool arguments for approval prompts.
 * Used by FeedbackFormRenderer for approval prompts.
 *
 * Displays the tool arguments as JSON.
 */

import { type ReactNode } from "react";
import { Box, Text } from "@radix-ui/themes";

export interface ToolPreviewFieldProps {
  toolName: string;
  args: unknown;
}

/**
 * Format tool arguments for JSON display.
 * Truncates large values.
 */
function formatArgs(args: unknown): string {
  try {
    const str = JSON.stringify(args, null, 2);
    // Truncate if too long
    if (str.length > 500) {
      return str.slice(0, 500) + "\n...";
    }
    return str;
  } catch {
    return String(args);
  }
}

/**
 * Render the tool arguments as JSON.
 */
export function ToolPreviewField({ args }: ToolPreviewFieldProps): ReactNode {
  return (
    <Box
      style={{
        background: "var(--gray-3)",
        borderRadius: 6,
        padding: 12,
        maxHeight: 200,
        overflow: "auto",
      }}
    >
      <Text
        size="1"
        style={{
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {formatArgs(args)}
      </Text>
    </Box>
  );
}
