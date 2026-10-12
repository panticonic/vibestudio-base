/**
 * Transcript projection: one `ChatMessage` → the ANSI lines of its row, plus
 * the actions the person can take on it. Pure and memoised by message
 * identity: the chat store keeps unchanged rows as the very same objects, so
 * while a reply streams only its own row is laid out again.
 */
import type { ChatMessage } from "@workspace/agentic-core";
import type { ChatParticipants } from "@workspace/agentic-core/chat-store";
import {
  executionStatusLabel,
  extractFileMutationDetails,
  getStatusKey,
  protocolText,
  toolPresentation,
  type FileMutationDetails,
} from "@workspace/agentic-core/chat-presentation";
import { base64ByteLength } from "@workspace/agentic-core/result-images";
import { indentWrap, paint, sanitize, style, symbols, truncate, width, wrap } from "./ansi.js";
import { highlightLines } from "./highlight.js";
import { renderMarkdown } from "./markdown.js";

/** Everything a row's layout depends on besides the message itself. */
export interface RowContext {
  selfId: string | null;
  participants: ChatParticipants;
  /** Width available to the row (the transcript gutter is already subtracted). */
  columns: number;
  /** How to open the approvals overlay, e.g. "Ctrl-Space a". */
  approvalsKey: string;
}

export type MessageActionId =
  | "toggle"
  | "fork"
  | "edit-fork"
  | "retry"
  | "schedule-resume"
  | "connect"
  | "copy-text";

export interface MessageAction {
  id: MessageActionId;
  key: string;
  label: string;
}

/** What kind of row a message is; drives default expansion and actions. */
export type RowKind =
  | "user"
  | "agent"
  | "thinking"
  | "typing"
  | "tool"
  | "task"
  | "approval"
  | "credential"
  | "diagnostic"
  | "lifecycle"
  | "disconnect"
  | "fork"
  | "notice";

export function rowKind(msg: ChatMessage, selfId: string | null): RowKind {
  if (msg.disconnectedAgent) return "disconnect";
  if (msg.task) return "task";
  switch (msg.contentType) {
    case "thinking":
      return "thinking";
    case "typing":
      return "typing";
    case "invocation":
      return msg.invocation ? "tool" : "notice";
    case "approval":
      return "approval";
    case "credential-connect":
      return "credential";
    case "diagnostic":
      return "diagnostic";
    case "lifecycle":
      return "lifecycle";
    case "fork":
    case "cross-channel-sent":
      return "fork";
    case undefined:
    case "text":
    case "markdown":
      return msg.senderId === selfId ? "user" : "agent";
    default:
      return msg.diagnostic ? "diagnostic" : "notice";
  }
}

/** Rows that have a collapsed and an expanded form. */
export function isExpandable(msg: ChatMessage, selfId: string | null): boolean {
  const kind = rowKind(msg, selfId);
  return kind === "thinking" || kind === "tool" || kind === "task";
}

const USAGE_LIMIT_CODES = new Set(["usage_limit_terminal", "quota_exhausted_terminal"]);
const RETRYABLE_CODES = new Set([
  "model_stream_stalled_retryable",
  "unknown_retryable",
  "rate_limited_retryable",
  "provider_overloaded_retryable",
  "circuit_breaker_open_retryable",
]);

export function isUsageLimit(msg: ChatMessage): boolean {
  return !!msg.diagnostic?.failureCode && USAGE_LIMIT_CODES.has(msg.diagnostic.failureCode);
}

/** Actions available on a selected row, in the order the hint bar lists them. */
export function messageActions(msg: ChatMessage, selfId: string | null): MessageAction[] {
  const kind = rowKind(msg, selfId);
  const actions: MessageAction[] = [];
  if (isExpandable(msg, selfId)) actions.push({ id: "toggle", key: "Enter", label: "expand" });
  if ((kind === "user" || kind === "agent") && !msg.retracted && typeof msg.seq === "number") {
    actions.push({ id: "fork", key: "f", label: "fork here" });
    if (kind === "user") actions.push({ id: "edit-fork", key: "e", label: "edit & fork" });
  }
  if (kind === "diagnostic" && msg.diagnostic) {
    const code = msg.diagnostic.failureCode ?? "";
    if (RETRYABLE_CODES.has(code) || USAGE_LIMIT_CODES.has(code) || msg.diagnostic.recoverable)
      actions.push({ id: "retry", key: "r", label: "retry now" });
    if (msg.diagnostic.resetAt && msg.diagnostic.messageId)
      actions.push({ id: "schedule-resume", key: "s", label: "resume when the limit resets" });
  }
  if (kind === "lifecycle" && msg.lifecycle?.status === "interrupted")
    actions.push({ id: "retry", key: "r", label: "resume" });
  if (kind === "credential") actions.push({ id: "connect", key: "c", label: "connect" });
  return actions;
}

// ── names ────────────────────────────────────────────────────────────────────

export function participantName(
  id: string,
  participants: ChatParticipants,
  fallback?: { name?: string; handle?: string }
): string {
  const metadata = participants[id]?.metadata as { name?: string; handle?: string } | undefined;
  return metadata?.name || fallback?.name || metadata?.handle || fallback?.handle || id;
}

function senderLabel(msg: ChatMessage, ctx: RowContext): string {
  if (msg.senderId === ctx.selfId) return "You";
  return participantName(msg.senderId, ctx.participants, msg.senderMetadata);
}

// ── rows ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  lines: string[];
}

const rowCache = new WeakMap<ChatMessage, CacheEntry>();

/**
 * Lay out one row. `expanded` is the person's choice for expandable rows;
 * `childLines` is the already-rendered child transcript of an expanded
 * subagent card.
 */
export function renderRow(
  msg: ChatMessage,
  ctx: RowContext,
  expanded: boolean,
  childLines?: readonly string[]
): string[] {
  // Names can change under an unchanged message (a participant renames), so
  // the sender's current label is part of the key.
  const key = `${ctx.columns}|${expanded ? 1 : 0}|${ctx.selfId}|${senderLabel(msg, ctx)}|${ctx.approvalsKey}`;
  if (!childLines) {
    const cached = rowCache.get(msg);
    if (cached && cached.key === key) return cached.lines;
  }
  const lines = layoutRow(msg, ctx, expanded, childLines);
  if (!childLines) rowCache.set(msg, { key, lines });
  return lines;
}

function layoutRow(
  msg: ChatMessage,
  ctx: RowContext,
  expanded: boolean,
  childLines?: readonly string[]
): string[] {
  const cols = Math.max(20, ctx.columns);
  const kind = rowKind(msg, ctx.selfId);
  switch (kind) {
    case "user":
    case "agent":
      return messageRow(msg, ctx, kind, cols);
    case "thinking":
      return thinkingRow(msg, cols, expanded);
    case "typing":
      return [
        style.gray(`${symbols.agent} ${senderLabel(msg, ctx)} is working${symbols.ellipsis}`),
      ];
    case "tool":
      return toolRow(msg, cols, expanded);
    case "task":
      return taskRow(msg, cols, expanded, childLines);
    case "approval":
      return approvalRow(msg, ctx, cols);
    case "credential":
      return credentialRow(msg, cols);
    case "diagnostic":
      return diagnosticRow(msg, cols);
    case "lifecycle":
      return lifecycleRow(msg, cols);
    case "disconnect": {
      const agent = msg.disconnectedAgent!;
      return indentWrap(
        `${agent.name} (@${agent.handle}) disconnected unexpectedly. It rejoins by itself when it recovers; /agents shows who is here.`,
        cols,
        style.yellow(`${symbols.warning} `),
        "  "
      ).map((line) => style.yellow(line));
    }
    case "fork":
      return forkRow(msg, cols);
    case "notice":
      return noticeRow(msg, cols);
  }
}

function receiptBadge(msg: ChatMessage): string {
  if (!msg.receipts || msg.retracted) return "";
  switch (msg.receipts.aggregate) {
    case "read":
      return style.green(`${symbols.check}${symbols.check} read`);
    case "partial":
      return style.cyan(`${symbols.check} received`);
    default:
      return style.gray("sent");
  }
}

function messageRow(
  msg: ChatMessage,
  ctx: RowContext,
  kind: "user" | "agent",
  cols: number
): string[] {
  const name = senderLabel(msg, ctx);
  const marker = kind === "user" ? style.cyan(symbols.user) : style.magenta(symbols.agent);
  const modelLabel = msg.model ? style.gray(` · ${msg.model.displayName || msg.model.ref}`) : "";
  const edited = msg.revision || msg.editedAt ? style.gray(" · edited") : "";
  const right = kind === "user" ? receiptBadge(msg) : "";
  let header = `${marker} ${style.bold(name)}${modelLabel}${edited}`;
  if (right) {
    const gap = cols - width(header) - width(right);
    header = gap >= 2 ? header + " ".repeat(gap) + right : `${header}  ${right}`;
  }
  const lines = [truncate(header, cols)];
  if (msg.retracted) {
    lines.push(style.gray(style.strike("  message cancelled before anyone read it")));
    return lines;
  }
  const body = msg.content ? renderMarkdown(msg.content, cols - 2) : [];
  if (msg.complete === false) {
    if (body.length === 0) body.push("");
    body[body.length - 1] += style.cyan(symbols.cursor);
  }
  for (const line of body) lines.push(`  ${line}`);
  for (const attachment of msg.attachments ?? []) {
    const size = attachment.data ? ` · ${formatBytes(attachment.data.byteLength)}` : "";
    lines.push(
      `  ${style.magenta(`[${attachment.mimeType?.startsWith("image/") ? "image" : "file"}: ${attachment.name ?? attachment.id}${size}]`)}`
    );
  }
  if (msg.error) {
    lines.push(...indentWrap(`Not delivered: ${msg.error}`, cols, style.red(`  ${symbols.cross} `), "    ").map((l) => style.red(l)));
  }
  return lines;
}

function thinkingRow(msg: ChatMessage, cols: number, expanded: boolean): string[] {
  const text = sanitize(msg.content).trim();
  const live = msg.complete === false;
  const lineCount = text ? text.split("\n").length : 0;
  const head = `${expanded ? symbols.expanded : symbols.collapsed} ${live ? "Thinking" : "Thought"}${live ? symbols.ellipsis : ""}`;
  if (!expanded) {
    const preview = text.split("\n").filter(Boolean).at(-1) ?? "";
    const summary = live && preview ? ` ${preview}` : lineCount ? ` (${lineCount} line${lineCount === 1 ? "" : "s"})` : "";
    return [style.gray(truncate(`${head}${summary}`, cols))];
  }
  return [
    style.gray(head),
    ...wrap(text, cols - 2).map((line) => `  ${style.gray(style.italic(line))}`),
  ];
}

// ── tools ────────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  pending: "yellow",
  complete: "green",
  error: "red",
  cancelled: "yellow",
  abandoned: "gray",
} as const;

function toolRow(msg: ChatMessage, cols: number, expanded: boolean): string[] {
  const payload = msg.invocation!;
  const { displayName, preview, color } = toolPresentation(payload);
  const statusKey = getStatusKey(payload);
  const statusText = executionStatusLabel(payload.execution.status);
  const status = paint(statusText, STATUS_STYLES[statusKey]);
  const chevron = expanded ? symbols.expanded : symbols.collapsed;
  const nameStyled = paint(displayName, "bold", color === "red" ? "red" : color === "amber" ? "yellow" : undefined);
  const headLeft = `${style.gray(chevron)} ${nameStyled} ${style.gray(preview)}`;
  const room = cols - width(status) - 1;
  const header = `${truncate(headLeft, room)}${" ".repeat(Math.max(1, room - width(truncate(headLeft, room)) + 1))}${status}`;
  const lines = [header];
  const summary = toolSummary(payload);
  if (!expanded) {
    if (summary) lines.push(`  ${truncate(summary, cols - 2)}`);
    return lines;
  }
  const execution = payload.execution;
  const pad = (text: string) => `  ${text}`;
  if (execution.description) {
    for (const line of wrap(style.italic(sanitize(execution.description)), cols - 2)) lines.push(pad(line));
  }
  if (execution.consoleOutput) {
    lines.push(pad(style.gray("Console")));
    for (const line of sanitize(execution.consoleOutput).split("\n").slice(-400)) {
      const level = /^\[(DEBUG|INFO|WARN|ERROR)\]/.exec(line)?.[1];
      const styled = level === "ERROR" ? style.red(line) : level === "WARN" ? style.yellow(line) : level === "DEBUG" ? style.gray(line) : line;
      for (const piece of wrap(styled, cols - 4)) lines.push(pad(`${style.gray("│")} ${piece}`));
    }
  }
  const mutation = extractFileMutationDetails(execution.result);
  if (!mutation && Object.keys(payload.arguments ?? {}).length > 0) {
    lines.push(pad(style.gray("Arguments")));
    lines.push(...jsonBlock(payload.arguments, cols - 2).map(pad));
  }
  if (mutation) {
    lines.push(...mutationLines(mutation, cols - 2).map(pad));
  } else if (execution.result !== undefined && execution.result !== null) {
    const isError = statusKey === "error";
    lines.push(pad(style.gray(isError ? "Error" : "Result")));
    const text = resultText(execution.result);
    if (text !== null) {
      for (const line of renderMarkdown(text, cols - 2)) lines.push(pad(isError ? style.red(line) : line));
    } else {
      lines.push(...jsonBlock(execution.result, cols - 2).map(pad));
    }
  }
  for (const [index, image] of (execution.resultImages ?? []).entries()) {
    lines.push(pad(style.magenta(`[image ${index + 1}: ${image.mimeType}, ${formatBytes(base64ByteLength(image.data))}]`)) + style.gray(" (shown in the desktop app)"));
  }
  if (execution.resultTruncated) lines.push(pad(style.gray("The result was truncated before it reached the chat.")));
  return lines;
}

/** One line summarising a tool result, shown under a collapsed card. */
export function toolSummary(payload: NonNullable<ChatMessage["invocation"]>): string {
  const execution = payload.execution;
  if (execution.status === "pending" || execution.status === "running") {
    const last = execution.consoleOutput?.trim().split("\n").at(-1);
    return last ? style.gray(sanitize(last)) : "";
  }
  const mutation = extractFileMutationDetails(execution.result);
  if (mutation) return mutationSummary(mutation);
  const images = execution.resultImages?.length ?? 0;
  const imageNote = images ? style.magenta(` [${images} image${images === 1 ? "" : "s"}]`) : "";
  const evalResult = evalDetails(execution.result);
  if (evalResult) {
    if (evalResult.success === false)
      return style.red(firstLine(evalResult.error ?? "failed")) + imageNote;
    const value = evalResult.returnValue;
    const shown = value === undefined ? (evalResult.console ? firstLine(evalResult.console) : "done") : firstLine(typeof value === "string" ? value : safeJson(value));
    return style.gray(`→ ${shown}`) + imageNote;
  }
  if (getStatusKey(payload) === "error") return style.red(firstLine(resultText(execution.result) ?? "failed")) + imageNote;
  const text = resultText(execution.result);
  if (text) return style.gray(`→ ${firstLine(text)}`) + imageNote;
  return imageNote.trim();
}

function evalDetails(result: unknown): { success?: boolean; console?: string; returnValue?: unknown; error?: string } | null {
  const record = asRecord(result);
  const details = asRecord(record?.["details"]) ?? record;
  if (!details || typeof details["success"] !== "boolean") return null;
  return {
    success: details["success"] as boolean,
    ...(typeof details["console"] === "string" ? { console: details["console"] as string } : {}),
    ...("returnValue" in details ? { returnValue: details["returnValue"] } : {}),
    ...(typeof details["error"] === "string" ? { error: details["error"] as string } : {}),
  };
}

function resultText(result: unknown): string | null {
  if (typeof result === "string") return sanitize(result);
  const record = asRecord(result);
  if (!record) return null;
  const protocol = protocolText({ execution: { result } } as never);
  if (protocol) return sanitize(protocol);
  const content = record["content"];
  if (Array.isArray(content)) {
    const text = content
      .map((block) => (asRecord(block)?.["type"] === "text" ? String(asRecord(block)?.["text"] ?? "") : ""))
      .filter(Boolean)
      .join("\n");
    if (text) return sanitize(text);
  }
  return null;
}

function mutationSummary(mutation: FileMutationDetails): string {
  if (mutation.status === "conflict") {
    const conflict = mutation.conflicts[0];
    return style.yellow(`conflict${conflict ? `: ${firstLine(conflict.message)}` : ""}`);
  }
  const parts = mutation.operations.map((op) => {
    const { added, removed } = diffCounts(op.diff);
    const counts = added || removed ? ` ${style.green(`+${added}`)} ${style.red(`−${removed}`)}` : "";
    return `${op.status} ${op.path}${counts}`;
  });
  return parts.join(style.gray(" · "));
}

function diffCounts(diff: string | undefined): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff?.split("\n") ?? []) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function mutationLines(mutation: FileMutationDetails, cols: number): string[] {
  const out: string[] = [];
  for (const op of mutation.operations) {
    out.push(`${style.bold(op.path)} ${style.gray(op.status)}`);
    if (op.diff) {
      for (const line of sanitize(op.diff).split("\n")) {
        const styled = line.startsWith("+") && !line.startsWith("+++")
          ? style.green(line)
          : line.startsWith("-") && !line.startsWith("---")
            ? style.red(line)
            : line.startsWith("@@")
              ? style.cyan(line)
              : style.gray(line);
        out.push(...wrap(styled, cols));
      }
      if (op.diffTruncated) out.push(style.gray("(diff truncated)"));
    }
  }
  for (const conflict of mutation.conflicts) {
    out.push(...indentWrap(`${conflict.path}: ${conflict.message}`, cols, style.yellow(`${symbols.warning} `), "  "));
    if (conflict.recovery?.instruction) out.push(...indentWrap(conflict.recovery.instruction, cols, "  ").map((l) => style.gray(l)));
  }
  return out;
}

function jsonBlock(value: unknown, cols: number): string[] {
  const text = safeJson(value, 2);
  const lines = text.split("\n");
  const shown = lines.slice(0, 200);
  const out = highlightLines(shown.join("\n"), "json").flatMap((line) => wrap(line, cols));
  if (lines.length > shown.length) out.push(style.gray(`… ${lines.length - shown.length} more lines`));
  return out;
}

// ── tasks ────────────────────────────────────────────────────────────────────

function taskRow(msg: ChatMessage, cols: number, expanded: boolean, childLines?: readonly string[]): string[] {
  const task = msg.task!;
  const label = task.subagent?.label || task.title || "Background task";
  const statusKey = task.execution.isError ? "error" : task.execution.status === "running" ? "pending" : task.execution.status === "error" ? "error" : task.execution.status === "complete" ? "complete" : task.execution.status === "pending" ? "pending" : task.execution.status;
  const status = paint(executionStatusLabel(task.execution.status), STATUS_STYLES[statusKey as keyof typeof STATUS_STYLES] ?? "gray");
  const kind = task.subagent ? "Subagent" : "Task";
  const head = `${style.gray(expanded ? symbols.expanded : symbols.collapsed)} ${style.bold(kind)} ${label}`;
  const room = cols - width(status) - 1;
  const left = truncate(head, room);
  const lines = [`${left}${" ".repeat(Math.max(1, room - width(left) + 1))}${status}`];
  if (task.execution.description) {
    const description = sanitize(task.execution.description);
    if (expanded) lines.push(...renderMarkdown(description, cols - 2).map((l) => `  ${l}`));
    else lines.push(`  ${style.gray(truncate(firstLine(description), cols - 2))}`);
  }
  if (expanded) {
    if (task.subagent?.taskChannelId) {
      if (childLines && childLines.length > 0) {
        for (const line of childLines) lines.push(`  ${style.gray("┃")} ${line}`);
      } else if (!childLines) {
        lines.push(style.gray(`  ${symbols.ellipsis} opening the subagent's transcript`));
      } else {
        lines.push(style.gray("  The subagent has not said anything yet."));
      }
    }
    const result = task.execution.result;
    if (result !== undefined && result !== null) {
      const text = resultText(result) ?? safeJson(result, 2);
      lines.push(`  ${style.gray("Result")}`);
      lines.push(...renderMarkdown(text, cols - 2).map((l) => `  ${l}`));
    }
  }
  return lines;
}

// ── notices ──────────────────────────────────────────────────────────────────

function approvalRow(msg: ChatMessage, ctx: RowContext, cols: number): string[] {
  const approval = msg.approval!;
  const question = approval.question ? sanitize(approval.question) : "An agent asked for permission.";
  if (approval.status === "requested") {
    return [
      ...indentWrap(`Approval needed: ${question}`, cols, style.yellow(`${symbols.warning} `), "  ").map((l) => style.yellow(l)),
      style.gray(`  Answer it in the approvals overlay: press ${ctx.approvalsKey}.`),
    ];
  }
  const granted = approval.status === "granted";
  const text = `${granted ? "Approved" : "Denied"}: ${question}${approval.reason ? ` (${sanitize(approval.reason)})` : ""}`;
  return indentWrap(text, cols, granted ? style.green(`${symbols.check} `) : style.red(`${symbols.cross} `), "  ").map((l) => style.gray(l));
}

function credentialRow(msg: ChatMessage, cols: number): string[] {
  const request = msg.credentialRequest!;
  const provider = request.providerId;
  const reason = request.reason ? sanitize(request.reason) : `The agent needs a ${provider} account to continue.`;
  return [
    ...indentWrap(`Connect ${provider}: ${reason}`, cols, style.yellow("⚿ "), "  ").map((l) => style.yellow(l)),
    style.gray(`  Select this row and press c, or type /connect ${provider}. The agent resumes once connected.`),
  ];
}

function diagnosticRow(msg: ChatMessage, cols: number): string[] {
  const diagnostic = msg.diagnostic!;
  const tone = diagnostic.severity === "error" ? "red" : diagnostic.severity === "warning" ? "yellow" : "gray";
  const lines = indentWrap(sanitize(diagnostic.title), cols, paint(`${symbols.warning} `, tone), "  ").map((l) => paint(l, tone, "bold"));
  const detail = diagnostic.detail ?? diagnostic.reason;
  if (detail) lines.push(...indentWrap(sanitize(detail), cols, "  ").map((l) => style.gray(l)));
  if (isUsageLimit(msg)) {
    const reset = diagnostic.resetAt ? ` The limit resets at ${formatTime(diagnostic.resetAt)}.` : "";
    lines.push(
      ...indentWrap(
        `Usage limit reached.${reset} Select this row: r retries now${diagnostic.resetAt && diagnostic.messageId ? ", s resumes automatically when it resets" : ""}; /model switches to another model.`,
        cols,
        "  "
      ).map((l) => style.yellow(l))
    );
  } else if (diagnostic.failureCode === "auth_or_credentials") {
    lines.push(style.gray("  Reconnect the provider with /connect, then select this row and press r."));
  } else if (diagnostic.failureCode && RETRYABLE_CODES.has(diagnostic.failureCode)) {
    lines.push(style.gray("  Select this row and press r to retry."));
  }
  return lines;
}

function lifecycleRow(msg: ChatMessage, cols: number): string[] {
  const lifecycle = msg.lifecycle!;
  const badge = { recovered: "Recovered", interrupted: "Interrupted", failed: "Recovery failed", waiting: "Waiting" }[lifecycle.status] ?? lifecycle.status;
  const tone = lifecycle.status === "failed" ? "red" : lifecycle.status === "recovered" ? "green" : "yellow";
  const lines = indentWrap(`${badge}: ${sanitize(lifecycle.title)}`, cols, paint("◆ ", tone), "  ");
  const detail = lifecycle.detail ?? msg.content;
  if (detail) lines.push(...indentWrap(sanitize(detail), cols, "  ").map((l) => style.gray(l)));
  if (lifecycle.status === "interrupted") lines.push(style.gray("  Select this row and press r to resume."));
  return lines;
}

function forkRow(msg: ChatMessage, cols: number): string[] {
  if (msg.fork) {
    return indentWrap(`Forked "${sanitize(msg.fork.label)}"${msg.fork.actor.displayName ? ` by ${msg.fork.actor.displayName}` : ""} from here. /forks lists forks and switches to them.`, cols, style.cyan("⑂ "), "  ").map((l) => style.gray(l));
  }
  if (msg.crossChannel) {
    return indentWrap(`Sent to another conversation: ${sanitize(msg.crossChannel.summary ?? msg.crossChannel.channelId)}`, cols, style.cyan("↗ "), "  ").map((l) => style.gray(l));
  }
  return noticeRow(msg, cols);
}

function noticeRow(msg: ChatMessage, cols: number): string[] {
  if (msg.contentType === "inline_ui" || msg.contentType === "custom") {
    return [style.gray(truncate(`▣ An interactive card is here; open this chat in the desktop app to use it.`, cols))];
  }
  if (msg.automation) {
    const automation = msg.automation;
    return indentWrap(`Automation "${sanitize(automation.snapshot.name)}" ${automation.status}${automation.summary ? `: ${sanitize(automation.summary)}` : ""}`, cols, style.cyan("⏲ "), "  ").map((l) => style.gray(l));
  }
  const text = sanitize(msg.content || msg.contentType || "").trim();
  if (!text) return [];
  return indentWrap(text, cols, style.gray("· "), "  ").map((l) => style.gray(l));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstLine(text: string): string {
  return sanitize(text).trim().split("\n")[0] ?? "";
}

function safeJson(value: unknown, indent?: number): string {
  try {
    return JSON.stringify(value, null, indent) ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** An ISO timestamp as "HH:MM UTC" (today) or "YYYY-MM-DD HH:MM UTC". */
export function formatTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hhmm = date.toISOString().slice(11, 16);
  const sameDay = new Date(now).toISOString().slice(0, 10) === date.toISOString().slice(0, 10);
  return sameDay ? `${hhmm} UTC` : `${date.toISOString().slice(0, 10)} ${hhmm} UTC`;
}

/** Plain text of a message for export and copy. */
export function messagePlainText(msg: ChatMessage): string {
  return msg.content ?? "";
}
