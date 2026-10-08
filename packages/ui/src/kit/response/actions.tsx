/**
 * The single channel through which catalog controls talk back to the
 * conversation. A host (the chat transcript, an inline UI surface) provides
 * `send`; controls read it with `useResponseActions`. Outside a provider the
 * controls render disabled and say why.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Button, Text, Tooltip } from "@radix-ui/themes";
import { CheckCircledIcon } from "@radix-ui/react-icons";

/**
 * A machine-stable description of the UI selection carried by a sent message,
 * alongside its readable text (mirrors `AgentProductMetadata.interaction`).
 */
export interface ResponseInteraction {
  source: string;
  kind: string;
  action: string;
  targetId: string;
  /** Selected option values, for controls that choose among options. */
  values?: string[];
}

/** An interaction already recorded in the conversation transcript. */
export interface ResponseAnswer {
  /** The readable message text that was sent. */
  text: string;
  /** The selected option values, when the interaction carried them. */
  values?: string[];
}

export interface ResponseSendOptions {
  interaction?: ResponseInteraction;
}

export interface ResponseActions {
  /** Send a visible user message to the conversation. */
  send(text: string, options?: ResponseSendOptions): Promise<void>;
  /**
   * The latest already-sent message carrying `interaction.source === source`
   * and `interaction.targetId === targetId`, read from the durable transcript.
   * Lets controls render as answered after a reload or on another device.
   */
  answer(source: string, targetId: string): ResponseAnswer | undefined;
}

const ResponseActionsContext = createContext<ResponseActions | null>(null);

export interface ResponseActionsProviderProps {
  send: (text: string, options?: ResponseSendOptions) => Promise<unknown> | unknown;
  /** Looks up an interaction already present in the conversation. Absent ⇒ nothing is ever answered. */
  answer?: (source: string, targetId: string) => ResponseAnswer | undefined;
  children?: ReactNode;
}

/** Connects catalog controls (ActionButton, Choices) to a conversation. */
export function ResponseActionsProvider({ send, answer, children }: ResponseActionsProviderProps) {
  const value = useMemo<ResponseActions>(
    () => ({
      send: async (text, options) => {
        await send(text, options);
      },
      answer: (source, targetId) => answer?.(source, targetId),
    }),
    [send, answer],
  );
  return <ResponseActionsContext.Provider value={value}>{children}</ResponseActionsContext.Provider>;
}

/** The surrounding conversation actions, or `null` when this view cannot send. */
export function useResponseActions(): ResponseActions | null {
  return useContext(ResponseActionsContext);
}

export const NO_ACTIONS_REASON = "Not connected to a conversation, so this control can't send a reply here.";

/**
 * Wraps a disabled send control so its reason is still reachable: disabled
 * buttons receive no pointer or focus events, so the tooltip anchors on a
 * focusable wrapper instead.
 */
export function UnavailableReason({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} aria-label={reason} className="vs-r-unavailable">
        {children}
      </span>
    </Tooltip>
  );
}

export interface ActionButtonProps {
  /** The user message sent when pressed. Also the label when there are no children. */
  message: string;
  /** Button label. Defaults to `message`. */
  children?: ReactNode;
  /** Stable id of this control. When set, the message carries `interaction: { source: "action-button", kind: "action", action, targetId: id }`. */
  id?: string;
  /** Interaction action name when `id` is set. Default "press". */
  action?: string;
  variant?: "classic" | "solid" | "soft" | "surface" | "outline" | "ghost";
  size?: "1" | "2" | "3" | "4";
}

/** A button that sends a fixed message to the conversation as the user. */
export function ActionButton({
  message,
  children,
  id,
  action = "press",
  variant = "soft",
  size = "1",
}: ActionButtonProps) {
  const actions = useResponseActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = typeof message === "string" ? message.trim() : "";
  const label = children ?? (text || "Action");
  const answered = id ? actions?.answer("action-button", id) !== undefined : false;

  if (!text || !actions) {
    return (
      <UnavailableReason reason={!text ? "This button has no message to send." : NO_ACTIONS_REASON}>
        <Button size={size} variant={variant} disabled>
          {label}
        </Button>
      </UnavailableReason>
    );
  }

  return (
    <span className="vs-r-action">
      <Button
        type="button"
        size={size}
        variant={variant}
        loading={pending}
        disabled={answered}
        aria-pressed={id ? answered : undefined}
        color={error ? "red" : undefined}
        onClick={() => {
          setPending(true);
          setError(null);
          const interaction = id ? { source: "action-button", kind: "action", action, targetId: id } : undefined;
          actions
            .send(text, interaction ? { interaction } : undefined)
            .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
            .finally(() => setPending(false));
        }}
      >
        {answered ? <CheckCircledIcon aria-hidden /> : null}
        {label}
      </Button>
      {error ? (
        <Text size="1" color="red" role="alert">
          Couldn't send: {error}
        </Text>
      ) : null}
    </span>
  );
}
