import React, { useMemo } from "react";
import { Badge, Box, Flex, IconButton, Spinner, Text } from "@radix-ui/themes";
import { StopIcon } from "@radix-ui/react-icons";
import type { InvocationCardPayload } from "@workspace/agentic-core";
import type { ChatSandboxValue } from "@workspace/agentic-core";
import { ExpandableChevron } from "./shared/Chevron";
import { CollapsibleSection } from "./shared/CollapsibleSection";
import { CopyButton } from "./shared/CopyButton";
import { executionStatusLabel, getStatusColor, getStatusKey, StatusDot } from "./shared/invocationStatus";
import { ToolArgumentsView, ToolDataView } from "./shared/ToolDataView";
import { renderDocsToolResult } from "./tool-result-renderers/DocsResult";
import {
  extractFileMutationDetails,
  renderFileMutationArguments,
  renderFileMutationToolResult,
} from "./tool-result-renderers/FileMutationResult";

import {
  formatDisplayName,
  toolPresentation,
  compactText,
  resultDetails,
  completedFailedVerification,
  protocolText,
  readableReason,
  messageCountLabel,
  notifyAddressees,
} from "@workspace/agentic-core/chat-presentation";

export { formatDisplayName, toolPresentation };

function SupervisionActionSummary({ payload }: { payload: InvocationCardPayload }) {
  const details = resultDetails(payload);
  const args = payload.arguments;
  const rows: Array<[string, string]> = [];
  const runId = compactText(args["runId"] ?? details?.["runId"], 80);
  if (runId) rows.push(["Run", runId]);
  if (payload.name === "suspend_turn") {
    rows.push([
      "Reason",
      readableReason(args["reason"] ?? details?.["reason"]) || "No foreground work",
    ]);
    const note = compactText(args["noteToSelf"] ?? details?.["noteToSelf"], 160);
    if (note) rows.push(["Note", note]);
  }
  if (payload.name === "notify") {
    const addressees = notifyAddressees(args["to"]);
    rows.push(["To", addressees.length > 0 ? addressees.join(", ") : "channel"]);
    rows.push(["Message", compactText(args["content"], 220)]);
  }
  if (payload.name === "read_subagent") {
    rows.push(["Cursor", compactText(args["afterSeq"] ?? 0, 24)]);
    if (details?.["nextSeq"] !== undefined)
      rows.push(["Next cursor", compactText(details["nextSeq"], 24)]);
    const detailMessages = details?.["messages"];
    if (Array.isArray(detailMessages)) {
      rows.push(["Messages", messageCountLabel(detailMessages.length)]);
    }
  }
  if (payload.name === "inspect_subagent") {
    rows.push(["Query", compactText(args["query"] ?? details?.["query"] ?? "status", 160)]);
  }
  if (payload.name === "spawn_subagent") {
    rows.push(["Mode", compactText(args["mode"], 32)]);
    const label = compactText(args["label"], 96);
    if (label) rows.push(["Label", label]);
    const task = compactText(args["task"], 260);
    if (task) rows.push(["Task", task]);
  }
  const warning = "";
  const textResult = compactText(protocolText(payload), 220);
  if (!rows.length && !warning && !textResult) return null;
  return (
    <Box className={`supervision-action-summary${warning ? " supervision-action-warning" : ""}`}>
      {warning && (
        <Text size="1" weight="medium" color="red" className="supervision-warning-text">
          {warning}
        </Text>
      )}
      {rows.length > 0 && (
        <Box className="supervision-action-grid">
          {rows.map(([name, value]) => (
            <React.Fragment key={name}>
              <Text size="1" color="gray" className="supervision-action-key">
                {name}
              </Text>
              <Text size="1" className="supervision-action-value">
                {value || "unknown"}
              </Text>
            </React.Fragment>
          ))}
        </Box>
      )}
      {textResult && (
        <Text size="1" color={warning ? "red" : "gray"} className="supervision-action-result">
          {textResult}
        </Text>
      )}
    </Box>
  );
}

type ConsoleLine = {
  text: string;
  level: "log" | "info" | "debug" | "warn" | "error";
};

function parseConsoleLine(line: string): ConsoleLine {
  const match = /^\[(DEBUG|INFO|WARN|ERROR)\]\s?(.*)$/i.exec(line);
  if (match) {
    const level = match[1]!.toLowerCase();
    return {
      text: match[2] ?? "",
      level: isConsoleLevel(level) ? level : "log",
    };
  }
  return { text: line, level: "log" };
}

function isConsoleLevel(value: string): value is ConsoleLine["level"] {
  return (
    value === "log" ||
    value === "info" ||
    value === "debug" ||
    value === "warn" ||
    value === "error"
  );
}

function consoleLineTone(level: ConsoleLine["level"]): {
  color: "gray" | "blue" | "amber" | "red";
  background: string;
  border: string;
} {
  if (level === "error") {
    return { color: "red", background: "var(--red-a2)", border: "var(--red-a5)" };
  }
  if (level === "warn") {
    return { color: "amber", background: "var(--amber-a2)", border: "var(--amber-a5)" };
  }
  if (level === "info") {
    return { color: "blue", background: "var(--blue-a2)", border: "var(--blue-a5)" };
  }
  return { color: "gray", background: "transparent", border: "var(--gray-a4)" };
}

function ConsoleOutputView({ output }: { output: string }) {
  const lines = useMemo(() => output.split(/\r?\n/).map(parseConsoleLine), [output]);
  return (
    <Box
      style={{
        border: "1px solid var(--gray-a5)",
        borderRadius: "4px",
        background: "var(--gray-a2)",
        overflow: "hidden",
      }}
    >
      {lines.map((line, index) => {
        const tone = consoleLineTone(line.level);
        return (
          <Flex
            key={`${index}-${line.text}`}
            align="start"
            gap="2"
            style={{
              minHeight: 22,
              padding: "3px 8px",
              borderTop: index === 0 ? undefined : "1px solid var(--gray-a3)",
              borderLeft: `3px solid ${tone.border}`,
              background: tone.background,
            }}
          >
            <Text
              size="1"
              color={tone.color}
              style={{
                width: 42,
                flexShrink: 0,
                fontFamily: "var(--font-mono, monospace)",
                textTransform: "uppercase",
              }}
            >
              {line.level === "log" ? "" : line.level}
            </Text>
            <Text
              size="1"
              color={line.level === "log" || line.level === "debug" ? "gray" : tone.color}
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontFamily: "var(--font-mono, monospace)",
                lineHeight: 1.5,
              }}
            >
              {line.text || " "}
            </Text>
          </Flex>
        );
      })}
    </Box>
  );
}

// ── ActionPill (collapsed view) ────────────────────────────────────────────

export const ActionPill = React.memo(function ActionPill({
  id,
  payload,
  onExpand,
  onCancel,
}: {
  id: string;
  payload: InvocationCardPayload;
  onExpand: (id: string) => void;
  onCancel?: () => void;
}) {
  const statusKey = getStatusKey(payload);
  const isPending = statusKey === "pending";
  const presentation = useMemo(() => toolPresentation(payload), [payload]);
  const color =
    statusKey === "complete"
      ? presentation.color ?? getStatusColor(statusKey)
      : getStatusColor(statusKey);

  const preview = presentation.preview;
  const displayName = presentation.displayName;
  const title = preview ? `${displayName}: ${preview}` : displayName;

  const statusLabel = executionStatusLabel(payload.execution.status);

  return (
    <Flex align="center" gap="1" className="inline-action-pill-group">
      <Flex
        className="inline-action-pill"
        data-testid="invocation-pill"
        data-invocation-name={payload.name}
        data-invocation-status={statusKey}
        title={title}
        align="center"
        gap="1"
        onClick={() => onExpand(id)}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onExpand(id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={`${title} — ${statusLabel}`}
        style={{
          cursor: "pointer",
          userSelect: "none",
          padding: "2px 6px",
          borderRadius: "4px",
          backgroundColor: `var(--${color}-a3)`,
          border: `1px solid var(--${color}-a5)`,
        }}
      >
        {isPending ? (
          <Spinner size="1" />
        ) : (
          <StatusDot statusKey={statusKey} tone={color} />
        )}
        <Text className="inline-pill-label" size="1" color={color} weight="medium">
          {displayName}
        </Text>
        {preview && (
          <Text className="inline-pill-description" size="1" color="gray">
            {preview}
          </Text>
        )}
      </Flex>
      {isPending && onCancel && (
        <IconButton
          size="1"
          color="gray"
          variant="ghost"
          onClick={onCancel}
          aria-label="Cancel pending tool call"
          title="Stop"
        >
          <StopIcon />
        </IconButton>
      )}
    </Flex>
  );
});

// ── ExpandedAction (expanded view) ─────────────────────────────────────────

export const ExpandedAction = React.memo(function ExpandedAction({
  payload,
  onCollapse,
  onCancel,
  chat,
}: {
  payload: InvocationCardPayload;
  onCollapse: () => void;
  onCancel?: () => void;
  chat?: Partial<Pick<ChatSandboxValue, "rpc">> | null;
}) {
  const statusKey = getStatusKey(payload);
  const isPending = statusKey === "pending";
  const isError = statusKey === "error";
  const presentation = useMemo(() => toolPresentation(payload), [payload]);
  const color =
    statusKey === "complete"
      ? presentation.color ?? getStatusColor(statusKey)
      : getStatusColor(statusKey);
  const fileMutation = useMemo(
    () => extractFileMutationDetails(payload.execution.result),
    [payload.execution.result]
  );
  const resultColor =
    statusKey !== "complete"
      ? getStatusColor(statusKey)
      : completedFailedVerification(payload)
        ? "amber"
        : fileMutation?.status === "conflict"
          ? "amber"
          : fileMutation?.status === "unchanged"
            ? "gray"
            : "green";

  const displayName = presentation.displayName;

  const exec = payload.execution;
  const hasArgs = Object.keys(payload.arguments).length > 0;
  const detailsJson = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  return (
    <Box
      style={{
        backgroundColor: `var(--${color}-a2)`,
        borderRadius: "6px",
        padding: "8px 10px",
        border: `1px solid var(--${color}-a4)`,
      }}
    >
      <Flex
        align="center"
        gap="2"
        onClick={onCollapse}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCollapse();
          }
        }}
        role="button"
        tabIndex={0}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <Text color={color} style={{ display: "flex", alignItems: "center" }}>
          <ExpandableChevron expanded={true} />
        </Text>
        <StatusDot statusKey={statusKey} tone={color} />
        <Text size="1" color={color} weight="medium">
          {displayName}
        </Text>
        <Badge color={color} size="1" variant="soft">
          {exec.status}
        </Badge>
        <CopyButton
          value={detailsJson}
          label="Copy details"
          ariaLabel="Copy invocation details"
          style={{ marginLeft: "auto" }}
        />
        {isPending && onCancel && (
          <IconButton
            size="1"
            color="gray"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            aria-label="Cancel pending tool call"
            title="Stop"
          >
            <StopIcon />
          </IconButton>
        )}
      </Flex>

      <Flex direction="column" gap="2" mt="2" ml="4">
        <SupervisionActionSummary payload={payload} />

        {exec.description && (
          <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
            {exec.description}
          </Text>
        )}

        {exec.consoleOutput && (
          <CollapsibleSection label="Console" defaultOpen={true} color="blue">
            <ConsoleOutputView output={exec.consoleOutput} />
          </CollapsibleSection>
        )}

        {hasArgs && (
          <CollapsibleSection label="Arguments" defaultOpen={true}>
            {renderFileMutationArguments(payload.name, payload.arguments) ?? (
              <ToolArgumentsView args={payload.arguments} chat={chat} />
            )}
          </CollapsibleSection>
        )}

        {exec.result !== undefined && !isError && (
          <CollapsibleSection label="Result" defaultOpen={!isPending} color={resultColor}>
            {renderFileMutationToolResult(payload.name, exec.result) ??
              renderDocsToolResult(payload.name, exec.result) ?? (
                <ToolDataView value={exec.result} label="Result" chat={chat} />
              )}
          </CollapsibleSection>
        )}

        {isError && exec.result !== undefined && (
          <CollapsibleSection label="Error" defaultOpen={true} color="red">
            <ToolDataView value={exec.result} label="Error" chat={chat} />
          </CollapsibleSection>
        )}

        {exec.resultImages && exec.resultImages.length > 0 && (
          <CollapsibleSection label="Images" defaultOpen={true} color="blue">
            <Flex gap="2" wrap="wrap">
              {exec.resultImages.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt=""
                  style={{
                    maxWidth: "240px",
                    maxHeight: "240px",
                    borderRadius: "4px",
                    border: "1px solid var(--gray-a4)",
                  }}
                />
              ))}
            </Flex>
          </CollapsibleSection>
        )}

        {exec.resultTruncated && (
          <Text size="1" color="amber">
            Result was marked truncated before it reached the chat renderer.
          </Text>
        )}
      </Flex>
    </Box>
  );
});
