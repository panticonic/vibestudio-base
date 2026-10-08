import { useCallback, useMemo, useState, type ReactNode, useEffect } from "react";
import {
  ResponseProblemReporterContext,
  type ResponseProblemReport,
  type ResponseProblemReporter,
} from "@workspace/ui/response";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
  type UiFeedbackCategory,
  type UiFeedbackPayload,
} from "@workspace/agentic-protocol";

export type FeedbackDeliveryState = "sending" | "sent" | "failed";

/** The participant that authored the UI whose failure is being reported. */
export interface UiFeedbackAuthor {
  kind: string;
  id: string;
  participantId?: string;
}

/**
 * Publishes a `ui.feedback` event targeted at the UI's authoring participant
 * when mounted. Mounting happens exactly when the failure is shown, so the
 * agent hears about every failure the user sees — deduplicated by
 * occurrenceKey on the harness side and by idempotencyKey on the channel side.
 *
 * The reporter stays in the DOM as a hidden marker carrying its occurrence and
 * delivery state, so an observer of the rendered panel (a system test) can
 * tell which reported failures are still shown and when each report settled.
 */
export function UiFeedbackReporter({
  chat,
  author,
  category,
  refs,
  errorMessage,
  errorName,
  stack,
  componentStack,
  occurrenceKey,
  onDelivery,
}: {
  chat: Record<string, unknown>;
  author: UiFeedbackAuthor | undefined;
  category: UiFeedbackCategory;
  refs: NonNullable<UiFeedbackPayload["refs"]>;
  errorMessage: string;
  errorName?: string;
  stack?: string;
  componentStack?: string;
  occurrenceKey: string;
  onDelivery?: (state: FeedbackDeliveryState) => void;
}) {
  const [delivery, setDelivery] = useState<FeedbackDeliveryState>("sending");
  useEffect(() => {
    let cancelled = false;
    const settle = (state: FeedbackDeliveryState) => {
      setDelivery(state);
      onDelivery?.(state);
    };
    setDelivery("sending");
    const publish = chat["publish"];
    if (typeof publish !== "function" || !author) {
      settle("failed");
      return;
    }
    const participantId = author.participantId ?? author.id;
    const event: AgenticEvent<"ui.feedback"> = {
      kind: "ui.feedback",
      actor: { kind: "panel", id: "chat" },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        target: { kind: author.kind as never, id: author.id, participantId },
        to: [{ kind: "participant", participantId }],
        category,
        refs,
        error: {
          message: errorMessage,
          ...(errorName ? { name: errorName } : {}),
          ...(stack ? { stack } : {}),
          ...(componentStack ? { componentStack } : {}),
        },
        occurrenceKey,
      },
      createdAt: new Date().toISOString(),
    };
    void (async () => {
      try {
        await (
          publish as (
            kind: string,
            payload: unknown,
            options?: { idempotencyKey?: string },
          ) => Promise<unknown>
        )(AGENTIC_EVENT_PAYLOAD_KIND, event, {
          idempotencyKey: `ui-feedback:${occurrenceKey}`,
        });
        if (!cancelled) settle("sent");
      } catch (publishError) {
        console.warn("Failed to publish ui.feedback diagnostic", publishError);
        if (!cancelled) settle("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Publish once per occurrence — occurrenceKey is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occurrenceKey]);
  return (
    <span
      hidden
      data-ui-feedback-occurrence={occurrenceKey}
      data-ui-feedback-category={category}
      data-ui-feedback-delivery={delivery}
    />
  );
}

/**
 * Delivers every catalog `ProblemNotice` rendered inside it to the authoring
 * participant as one `props_invalid` ui.feedback. `scope` identifies the
 * rendered revision (message content, inline UI revision) so a corrected
 * re-send that fails the same way reports again; within a scope the same
 * component + problems collapse to one occurrence.
 */
export function ResponseProblemFeedback({
  chat,
  author,
  refs,
  scope,
  children,
}: {
  chat: Record<string, unknown>;
  author: UiFeedbackAuthor | undefined;
  refs: NonNullable<UiFeedbackPayload["refs"]>;
  scope: string;
  children: ReactNode;
}) {
  const [reports, setReports] = useState<Map<string, ResponseProblemReport>>(
    () => new Map(),
  );
  const report = useCallback(
    (problem: ResponseProblemReport) => {
      const key = `props_invalid:${scope}:${problem.component}:${JSON.stringify(problem.problems)}`;
      setReports((current) =>
        current.has(key) ? current : new Map(current).set(key, problem),
      );
    },
    [scope],
  );
  const reporter = useMemo<ResponseProblemReporter>(() => ({ report }), [report]);
  return (
    <ResponseProblemReporterContext.Provider value={reporter}>
      {children}
      {[...reports].map(([occurrenceKey, problem]) => (
        <UiFeedbackReporter
          key={occurrenceKey}
          chat={chat}
          author={author}
          category="props_invalid"
          refs={{ ...refs, component: problem.component }}
          errorMessage={problem.problems.join("; ")}
          occurrenceKey={occurrenceKey}
        />
      ))}
    </ResponseProblemReporterContext.Provider>
  );
}
