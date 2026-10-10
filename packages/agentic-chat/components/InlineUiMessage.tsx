/**
 * InlineUiMessage - Renders compiled TSX inline in conversation flow.
 *
 * Collapsible card that stays in the chat history. Users can expand/collapse
 * at any time to interact with the component.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
} from "react";
import { Box, Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import {
  deserializeRpcFailure,
  formatRpcFailure,
  type RpcFailure,
} from "@vibestudio/rpc";
import { EventErrorBoundary } from "@workspace/tool-ui/components/EventErrorBoundary";
import { InlineUiSurface } from "./InlineUiSurface";
import { CopyButton } from "./shared/CopyButton";
import {
  wrapChatForErrorReporting,
  wrapScopesForErrorReporting,
} from "../utils/wrapSandboxApis";
import type { InlineUiData } from "@workspace/pubsub";
import type {
  ChatSandboxValue,
  InlineUiCardPayload,
} from "@workspace/agentic-core";
import type { ConsoleCapture, ConsoleEntry } from "@workspace/eval";
import { useChatContext } from "../context/ChatContext";
import {
  ResponseProblemFeedback,
  UiFeedbackReporter,
  type FeedbackDeliveryState,
  type UiFeedbackAuthor,
} from "./UiFeedbackReporter";

type InlineUiFailurePhase = "compile" | "render" | "interaction";

function formatConsoleArg(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value !== "object" || value === null) return String(value);
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested !== "object" || nested === null) return nested;
      if (seen.has(nested)) return "[Circular]";
      seen.add(nested);
      return nested;
    });
  } catch {
    return String(value);
  }
}

function formatConsoleEntry(entry: ConsoleEntry): string {
  return entry.args.map(formatConsoleArg).join(" ");
}

function InlineUiConsole({
  runtime,
  componentId,
  messageId,
}: {
  runtime?: { console: ConsoleCapture };
  componentId: string;
  messageId?: string;
}) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const refreshQueued = useRef(false);

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    const unsubscribe = runtime.console.onEntry(() => {
      // Guest code can log while React is rendering. Defer the diagnostics
      // refresh so that capture never causes a cross-component render update.
      if (refreshQueued.current) return;
      refreshQueued.current = true;
      queueMicrotask(() => {
        refreshQueued.current = false;
        if (active) refresh();
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);

  if (!runtime) return null;
  const entries = runtime.console.getEntries();
  const dropped = runtime.console.getDroppedCount();
  if (entries.length === 0 && dropped === 0) return null;

  const details = JSON.stringify(
    {
      kind: "inline-ui-console",
      componentId,
      ...(messageId ? { messageId } : {}),
      retained: entries.length,
      dropped,
      capacity: runtime.console.capacity,
      entries: entries.map((entry) => ({
        level: entry.level,
        timestamp: new Date(entry.timestamp).toISOString(),
        text: formatConsoleEntry(entry),
      })),
    },
    null,
    2,
  );

  return (
    <Box
      data-inline-ui-console={componentId}
      data-message-id={messageId}
      role="region"
      aria-label={`Console output for inline UI ${componentId}`}
      mt="2"
      style={{
        border: "1px solid var(--gray-a5)",
        borderRadius: 4,
        background: "var(--gray-a2)",
        overflow: "hidden",
      }}
    >
      <Flex align="center" gap="2" px="2" py="1">
        <Text size="1" weight="medium" color="gray">
          Console · {entries.length}
        </Text>
        {dropped > 0 ? (
          <Text size="1" color="amber">
            {dropped} older {dropped === 1 ? "entry" : "entries"} omitted
          </Text>
        ) : null}
        <CopyButton
          value={details}
          label="Copy"
          ariaLabel={`Copy console for inline UI ${componentId}`}
          style={{ marginLeft: "auto" }}
        />
      </Flex>
      <Box
        style={{
          maxHeight: 180,
          overflow: "auto",
          borderTop: "1px solid var(--gray-a4)",
        }}
      >
        {entries.map((entry, index) => {
          const text = formatConsoleEntry(entry);
          const color =
            entry.level === "error"
              ? "red"
              : entry.level === "warn"
                ? "amber"
                : "gray";
          return (
            <Flex
              key={`${entry.timestamp}-${index}`}
              align="start"
              gap="2"
              px="2"
              py="1"
              style={{
                borderTop: index === 0 ? undefined : "1px solid var(--gray-a3)",
              }}
            >
              <Text
                size="1"
                color={color}
                style={{
                  width: 36,
                  flexShrink: 0,
                  fontFamily: "var(--font-mono, monospace)",
                  textTransform: "uppercase",
                }}
              >
                {entry.level === "log" ? "" : entry.level}
              </Text>
              <Text
                size="1"
                color={color}
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {text || " "}
              </Text>
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// InlineUiErrorCallout — error display. Inline UI failures auto-report to the
// authoring agent (`report`). Without a recorded agent author (a bar the user
// configured) the failure is shown but nothing is sent.
// ---------------------------------------------------------------------------

/** How a shown failure is auto-reported to the UI's authoring participant. */
export interface InlineUiFailureReport {
  author: UiFeedbackAuthor | undefined;
  /** Agent turn that published the failing UI; lets the agent attribute it. */
  turnId?: string;
  /** Identity of this failure occurrence (dedupes re-mounts and retries). */
  occurrenceKey: string;
}

export function InlineUiErrorCallout({
  error,
  componentId,
  messageId,
  source,
  phase = "interaction",
  componentStack,
  chat,
  report,
  surface = "inline_ui",
}: {
  error: Error;
  componentId: string;
  messageId?: string;
  source?: string;
  phase?: InlineUiFailurePhase;
  componentStack?: string;
  chat: ChatSandboxValue;
  report?: InlineUiFailureReport;
  /** Which agent-authored surface this is; selects the feedback ref. */
  surface?: "inline_ui" | "action_bar";
}) {
  const [delivery, setDelivery] = useState<FeedbackDeliveryState>("sending");

  const details = useMemo(
    () =>
      JSON.stringify(
        {
          kind: "inline-ui-error",
          phase,
          componentId,
          ...(messageId ? { messageId } : {}),
          ...(source ? { source } : {}),
          message: error.message || "Unknown error",
          ...(error.stack ? { stack: error.stack } : {}),
          ...(componentStack ? { componentStack } : {}),
        },
        null,
        2,
      ),
    [
      componentId,
      componentStack,
      error.message,
      error.stack,
      messageId,
      phase,
      source,
    ],
  );

  return (
    <Callout.Root
      color="red"
      size="1"
      data-inline-ui-error={componentId}
      data-message-id={messageId}
    >
      {report ? (
        <UiFeedbackReporter
          chat={chat as unknown as Record<string, unknown>}
          author={report.author}
          category={phase === "compile" ? "compile_failed" : "render_failed"}
          refs={{
            ...(surface === "action_bar"
              ? { actionBarId: componentId }
              : { inlineUiId: componentId }),
            ...(report.turnId ? { turnId: report.turnId as never } : {}),
          }}
          errorMessage={error.message || "Unknown error"}
          errorName={error.name || "Error"}
          stack={error.stack}
          componentStack={componentStack}
          occurrenceKey={report.occurrenceKey}
          onDelivery={setDelivery}
        />
      ) : null}
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Text as="div" size="2" className="rt-CalloutText">
        <Flex direction="column" gap="2">
          <Text size="1">
            Component error: {error.message || "Unknown error"}
          </Text>
          {report ? (
            <Text size="1" color="gray">
              {delivery === "sent"
                ? "Reported to the authoring agent."
                : delivery === "failed"
                  ? "Diagnostic not delivered — the authoring agent was not notified."
                  : "Reporting to the authoring agent…"}
            </Text>
          ) : null}
          <details>
            <summary
              style={{ cursor: "pointer", fontSize: "var(--font-size-1)" }}
            >
              Technical details
            </summary>
            <pre
              style={{
                fontSize: "var(--font-size-1)",
                margin: "var(--space-2) 0 0",
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
              }}
            >
              {[
                `Phase: ${phase}`,
                `Component: ${componentId}`,
                messageId ? `Message: ${messageId}` : null,
                source ? `Source: ${source}` : null,
                error.stack,
                componentStack
                  ? `React component stack:\n${componentStack}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n")}
            </pre>
          </details>
          <Flex gap="2">
            <CopyButton
              value={details}
              label="Copy details"
              ariaLabel={`Copy error details for inline UI ${componentId}`}
            />
          </Flex>
        </Flex>
      </Text>
    </Callout.Root>
  );
}

// ---------------------------------------------------------------------------
// InlineUiMessage
// ---------------------------------------------------------------------------

interface InlineUiMessageProps {
  data: InlineUiData | InlineUiCardPayload;
  messageId?: string;
  /** Participant that authored this inline UI; receives failure feedback. */
  author?: UiFeedbackAuthor;
  compiledComponent?: ComponentType<{
    props: Record<string, unknown>;
    chat: Record<string, unknown>;
    scope: Record<string, unknown>;
    scopes: Record<string, unknown>;
    inlineUi?: { id: string; renderedAt?: string };
  }>;
  compilationError?: RpcFailure;
  runtime?: { console: ConsoleCapture };
}

function isModelCredentialCard(data: InlineUiData): boolean {
  return (
    data.source.type === "file" &&
    data.source.path.endsWith("ModelCredentialRequiredCard.tsx")
  );
}

export function InlineUiMessage({
  data,
  messageId,
  author,
  compiledComponent: CompiledComponent,
  compilationError,
  runtime,
}: InlineUiMessageProps) {
  const {
    browserHandoffCaller,
    chat,
    onPersistAgentModel,
    scope,
    scopes,
    scopeManager,
  } = useChatContext();
  const componentProps = useMemo(() => {
    const props = data.props ?? {};
    if (!isModelCredentialCard(data)) return props;
    return {
      ...props,
      persistAgentModel: onPersistAgentModel,
      browserHandoffCallerId:
        typeof props["browserHandoffCallerId"] === "string"
          ? props["browserHandoffCallerId"]
          : browserHandoffCaller.id,
      browserHandoffCallerKind:
        typeof props["browserHandoffCallerKind"] === "string"
          ? props["browserHandoffCallerKind"]
          : browserHandoffCaller.kind,
    };
  }, [
    browserHandoffCaller.id,
    browserHandoffCaller.kind,
    data,
    onPersistAgentModel,
  ]);
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);
  const [runtimeError, setRuntimeError] = useState<{
    error: Error;
    phase: Exclude<InlineUiFailurePhase, "compile">;
    componentStack?: string;
    /** Distinguishes repeated interaction failures with the same message. */
    sequence: number;
  } | null>(null);
  const failureSequence = useRef(0);

  // Wrap chat so unhandled async rejections surface visually
  const reportComponentError = useCallback(
    (err: Error, info?: ErrorInfo) => {
      console.error(`[InlineUiMessage] Component "${data.id}" failed:`, err);
      setRuntimeError({
        error: err,
        phase: info ? "render" : "interaction",
        sequence: ++failureSequence.current,
        ...(info?.componentStack
          ? { componentStack: info.componentStack }
          : {}),
      });
    },
    [data.id],
  );
  const wrappedChat = useMemo(
    () => wrapChatForErrorReporting(chat, reportComponentError),
    [chat, reportComponentError],
  );
  const wrappedScopes = useMemo(
    () => wrapScopesForErrorReporting(scopes, reportComponentError),
    [scopes, reportComponentError],
  );

  const onInteraction = useCallback(() => {
    void scopeManager.persist().catch((err) => {
      console.warn(
        "[InlineUiMessage] Scope persist after interaction failed:",
        err,
      );
    });
  }, [scopeManager]);

  useEffect(() => scopeManager.onChange(forceUpdate), [scopeManager]);

  // A stable-ID render revision is a retry boundary even when its props did
  // not change (for example, after repairing the file at the same path).
  const resetKey = JSON.stringify({
    props: data.props,
    source: data.source,
    imports: data.imports,
    renderedAt: data.renderedAt,
  });
  useEffect(() => {
    setRuntimeError(null);
  }, [resetKey]);

  const revision = data.renderedAt ?? "";
  const reportFor = (
    phase: InlineUiFailurePhase,
    message: string,
    sequence?: number,
  ): InlineUiFailureReport => ({
    author,
    ...(data.turnId ? { turnId: data.turnId } : {}),
    occurrenceKey: [
      "inline_ui",
      phase,
      data.id,
      revision,
      message,
      ...(phase === "interaction" ? [String(sequence)] : []),
    ].join(":"),
  });

  if (runtimeError) {
    return (
      <Box data-inline-ui-id={data.id} data-message-id={messageId}>
        <InlineUiErrorCallout
          error={runtimeError.error}
          phase={runtimeError.phase}
          componentStack={runtimeError.componentStack}
          componentId={data.id}
          messageId={messageId}
          source={
            data.source.type === "file" ? data.source.path : "inline code"
          }
          chat={chat}
          report={reportFor(
            runtimeError.phase,
            runtimeError.error.message,
            runtimeError.sequence,
          )}
        />
        <InlineUiConsole
          runtime={runtime}
          componentId={data.id}
          messageId={messageId}
        />
      </Box>
    );
  }

  if (compilationError) {
    return (
      <Box data-inline-ui-id={data.id} data-message-id={messageId}>
        <InlineUiErrorCallout
          error={deserializeRpcFailure(compilationError)}
          phase="compile"
          componentId={data.id}
          messageId={messageId}
          source={
            data.source.type === "file" ? data.source.path : "inline code"
          }
          chat={chat}
          report={reportFor(
            "compile",
            formatRpcFailure(deserializeRpcFailure(compilationError)),
          )}
        />
        <InlineUiConsole
          runtime={runtime}
          componentId={data.id}
          messageId={messageId}
        />
      </Box>
    );
  }

  if (!CompiledComponent) {
    return null;
  }

  const compiled = (
    <CompiledComponent
      props={componentProps}
      chat={wrappedChat as unknown as Record<string, unknown>}
      scope={scope}
      scopes={wrappedScopes as unknown as Record<string, unknown>}
      inlineUi={{
        id: data.id,
        renderedAt: "renderedAt" in data ? data.renderedAt : undefined,
      }}
    />
  );

  return (
    <InlineUiSurface>
      <Box
        className="inline-ui-content"
        data-inline-ui-id={data.id}
        data-message-id={messageId}
        onClickCapture={onInteraction}
        onInputCapture={onInteraction}
        onChangeCapture={onInteraction}
      >
        <EventErrorBoundary
          resetKey={resetKey}
          onError={reportComponentError}
          renderFallback={(error) => (
            <InlineUiErrorCallout
              error={error}
              phase="render"
              componentId={data.id}
              messageId={messageId}
              source={
                data.source.type === "file" ? data.source.path : "inline code"
              }
              chat={chat}
              report={reportFor("render", error.message)}
            />
          )}
        >
          <Suspense fallback={<Spinner size="1" />}>
            {author ? (
              <ResponseProblemFeedback
                chat={chat as unknown as Record<string, unknown>}
                author={author}
                refs={{
                  inlineUiId: data.id,
                  ...(data.turnId ? { turnId: data.turnId as never } : {}),
                }}
                scope={`inline_ui:${data.id}:${revision}`}
              >
                {compiled}
              </ResponseProblemFeedback>
            ) : (
              compiled
            )}
          </Suspense>
        </EventErrorBoundary>
        <InlineUiConsole
          runtime={runtime}
          componentId={data.id}
          messageId={messageId}
        />
      </Box>
    </InlineUiSurface>
  );
}

/**
 * Parse inline UI data from message content.
 * Returns null if parsing fails.
 */
export function parseInlineUiData(content: string): InlineUiData | null {
  try {
    const value = JSON.parse(content) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record["id"] !== "string") return null;
    const props =
      typeof record["props"] === "object" &&
      record["props"] !== null &&
      !Array.isArray(record["props"])
        ? (record["props"] as Record<string, unknown>)
        : undefined;
    const importsCandidate = record["imports"];
    const imports =
      typeof importsCandidate === "object" &&
      importsCandidate !== null &&
      !Array.isArray(importsCandidate) &&
      Object.values(importsCandidate).every(
        (entry) => typeof entry === "string",
      )
        ? (importsCandidate as Record<string, string>)
        : undefined;
    const renderedAt =
      typeof record["renderedAt"] === "string"
        ? record["renderedAt"]
        : undefined;
    const turnId =
      typeof record["turnId"] === "string" ? record["turnId"] : undefined;
    const shared = {
      id: record["id"],
      ...(imports ? { imports } : {}),
      ...(props ? { props } : {}),
      ...(renderedAt ? { renderedAt } : {}),
      ...(turnId ? { turnId } : {}),
    };
    const source = record["source"];
    if (typeof source === "object" && source !== null) {
      const sourceRecord = source as Record<string, unknown>;
      if (
        sourceRecord["type"] === "code" &&
        typeof sourceRecord["code"] === "string"
      ) {
        return {
          ...shared,
          source: { type: "code", code: sourceRecord["code"] },
        };
      }
      if (
        sourceRecord["type"] === "file" &&
        typeof sourceRecord["path"] === "string"
      ) {
        return {
          ...shared,
          source: { type: "file", path: sourceRecord["path"] },
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}
