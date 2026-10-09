/**
 * Feedback primitives for the shared app-wide UI kit: a generalized status
 * Badge, an OperationNotice, and an EmptyState.
 *
 * All motion uses the centralized keyframes/tokens from `foundation.css` and the
 * one reduced-motion block there - these components add no per-component motion
 * media queries.
 */
import type { CSSProperties, ReactNode } from "react";
import {
  Badge as RadixBadge,
  Box,
  Callout,
  Flex,
  Text,
} from "@radix-ui/themes";

/** The shared status vocabulary, mapped onto the semantic intent tokens. */
export type Intent =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "consent"
  | "neutral";

const INTENT_RADIX_COLOR: Record<
  Intent,
  React.ComponentProps<typeof RadixBadge>["color"]
> = {
  info: "blue",
  success: "grass",
  warning: "amber",
  error: "red",
  consent: "iris",
  neutral: "gray",
};

export interface StatusBadgeProps {
  intent?: Intent;
  children: ReactNode;
  /** Optional leading glyph (icon/avatar). */
  icon?: ReactNode;
  /** Radix badge size. */
  size?: "1" | "2" | "3";
  variant?: React.ComponentProps<typeof RadixBadge>["variant"];
  /** Replay a small ack-pop when this key changes (e.g. a receipt resolving). */
  pulseKey?: string | number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Generalized delivery/status badge - the chat `AckBadge` pattern made reusable.
 * Intent picks the semantic color so badges read consistently everywhere.
 */
export function StatusBadge({
  intent = "neutral",
  children,
  icon,
  size = "1",
  variant,
  pulseKey,
  className,
  style,
}: StatusBadgeProps) {
  return (
    <RadixBadge
      key={pulseKey}
      color={INTENT_RADIX_COLOR[intent]}
      size={size}
      variant={variant}
      className={className}
      style={
        pulseKey !== undefined
          ? {
              animation: "ack-pop var(--motion-base) var(--ease-emphasized)",
              ...style,
            }
          : style
      }
    >
      {icon}
      {children}
    </RadixBadge>
  );
}

/** Persistent operation feedback. Domain owners choose the message and intent;
 * this component owns presentation and announcement, never settlement or expiry. */
export function OperationNotice({
  children,
  intent = "info",
  actions,
}: {
  children: ReactNode;
  intent?: Intent;
  actions?: ReactNode;
}) {
  return (
    <Callout.Root
      size="1"
      color={INTENT_RADIX_COLOR[intent]}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <Callout.Text
        role={intent === "error" ? "alert" : "status"}
        aria-atomic="true"
      >
        {children}
      </Callout.Text>
      {actions ? (
        <Flex gap="2" wrap="wrap">
          {actions}
        </Flex>
      ) : null}
    </Callout.Root>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Optional primary action(s). */
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** A centered "nothing here yet" affordance for empty panes. */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
  style,
}: EmptyStateProps) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      className={className}
      style={{
        height: "100%",
        minHeight: 160,
        padding: "var(--space-5)",
        textAlign: "center",
        ...style,
      }}
    >
      {icon != null && (
        <Box style={{ color: "var(--gray-9)", opacity: 0.9 }}>{icon}</Box>
      )}
      <Box>
        <Text as="div" size="3" weight="medium">
          {title}
        </Text>
        {description != null && (
          <Text as="div" size="2" color="gray" mt="1">
            {description}
          </Text>
        )}
      </Box>
      {actions != null && (
        <Flex gap="2" align="center">
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
