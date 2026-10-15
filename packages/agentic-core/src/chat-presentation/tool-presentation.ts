/**
 * Label + one-line preview for an invocation, shared by every chat surface
 * (the panel's tool pill and subagent card, the terminal chat's tool card),
 * so "Read path: index.ts" means the same thing everywhere.
 */
import { prettifyToolName } from "@workspace/pubsub";
import type { InvocationCardPayload } from "../invocation-card-payload.js";
import { formatInvocationPreview } from "./action-format.js";
import { extractFileMutationDetails } from "./file-mutation.js";

export function formatDisplayName(toolName: string): string {
  return prettifyToolName(toolName)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

export function valueRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function compactText(value: unknown, max = 96): string {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 1))}...` : normalized;
}

export function resultDetails(payload: InvocationCardPayload): Record<string, unknown> | null {
  return valueRecord(valueRecord(payload.execution.result)?.["details"]);
}

export function completedFailedVerification(payload: InvocationCardPayload): string | null {
  if (
    payload.name !== "verify" ||
    payload.execution.status !== "complete" ||
    payload.execution.isError === true
  ) {
    return null;
  }
  const status = resultDetails(payload)?.["status"];
  return status === "failed" || status === "compilation-failed" ? status : null;
}

export function protocolText(payload: InvocationCardPayload): string {
  const content = valueRecord(payload.execution.result)?.["protocolContent"];
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const record = valueRecord(block);
      if (!record) return "";
      return record["type"] === "text" && typeof record["text"] === "string" ? record["text"] : "";
    })
    .filter(Boolean)
    .join(" ");
}

export function readableReason(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function messageCountLabel(count: number): string {
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

/** `notify`'s `to` is one ref or a list of them; an absent `to` is the channel. */
export function notifyAddressees(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return list.filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
}

/**
 * Label + one-line preview for an invocation. Exported so the subagent run
 * card renders a child's tool calls with exactly the naming the parent chat
 * uses — "Read path: index.ts" means the same thing at both depths.
 */
export function toolPresentation(payload: InvocationCardPayload): {
  displayName: string;
  preview: string;
  color?: "red" | "amber" | "green";
} {
  if (payload.name === "model.generation") {
    return { displayName: "Gen", preview: "" };
  }
  const args = payload.arguments;
  const details = resultDetails(payload);
  const fileMutation = extractFileMutationDetails(payload.execution.result);
  const failedVerification = completedFailedVerification(payload);
  if (failedVerification) {
    const operation = details?.["operation"] ?? args["operation"];
    const target = compactText(details?.["target"] ?? args["target"], 64);
    const outcome =
      operation === "build"
        ? "Build failed"
        : failedVerification === "compilation-failed"
          ? "Test compilation failed"
          : "Tests failed";
    return {
      displayName: "Verify",
      preview: `${outcome}${target ? ` · ${target}` : ""}`,
      color: "amber",
    };
  }
  if (payload.name === "write") {
    const path = compactText(args["path"], 72) || "file";
    const outcome = fileMutation?.status === "conflict" ? " · conflict" : "";
    return {
      displayName: "Write",
      preview: `${path}${outcome}`,
      ...(fileMutation?.status === "conflict" ? { color: "amber" as const } : {}),
    };
  }
  if (payload.name === "edit") {
    const path = compactText(args["path"], 64) || "file";
    const oldText = compactText(args["oldText"], 38);
    const match = fileMutation?.operations[0]?.matches?.[0];
    const suffix =
      fileMutation?.status === "conflict"
        ? " · conflict"
        : match?.mode === "normalized"
          ? " · normalized match"
          : "";
    return {
      displayName: "Edit",
      preview: `${path}${oldText ? ` · ${oldText}` : ""}${suffix}`,
      ...(fileMutation?.status === "conflict" || match?.mode === "normalized"
        ? { color: "amber" as const }
        : {}),
    };
  }
  if (payload.name === "apply_patch") {
    const operations = Array.isArray(args["operations"]) ? args["operations"] : [];
    const paths = operations
      .map((operation) => compactText(valueRecord(operation)?.["path"], 36))
      .filter(Boolean);
    const preview =
      paths.length === 1
        ? paths[0]!
        : `${operations.length} atomic operations${paths.length ? ` · ${paths.slice(0, 2).join(", ")}` : ""}`;
    return {
      displayName: "Apply Patch",
      preview: `${preview}${fileMutation?.status === "conflict" ? " · conflict" : ""}`,
      ...(fileMutation?.status === "conflict" ? { color: "amber" as const } : {}),
    };
  }
  const runId = compactText(args["runId"] ?? details?.["runId"], 24);
  if (payload.name === "suspend_turn") {
    const reason = readableReason(args["reason"] ?? details?.["reason"]) || "Suspend";
    return {
      displayName: "Suspend Turn",
      preview: reason,
      color: "amber",
    };
  }
  if (payload.name === "spawn_subagent") {
    const label = compactText(args["label"], 48);
    const mode = compactText(args["mode"], 12);
    return {
      displayName: "Spawn Subagent",
      preview: `${label || "Background task"}${mode ? ` (${mode})` : ""}`,
    };
  }
  if (payload.name === "read_subagent") {
    const detailMessages = details?.["messages"];
    const messages = Array.isArray(detailMessages) ? detailMessages.length : undefined;
    if (
      details?.["tokenWaste"] === "polling_without_new_subagent_messages" ||
      details?.["empty"] === true
    ) {
      return {
        displayName: "Read Subagent",
        preview: "Polling waste: no new messages. Suspend instead.",
        color: "red",
      };
    }
    if (typeof messages === "number") {
      return {
        displayName: "Read Subagent",
        preview: `${messageCountLabel(messages)}${runId ? ` from ${runId}` : ""}`,
      };
    }
    return {
      displayName: "Read Subagent",
      preview: runId ? `Transcript catch-up for ${runId}` : "Transcript catch-up",
    };
  }
  if (payload.name === "notify") {
    const addressees = notifyAddressees(args["to"]);
    return {
      displayName: "Notify",
      preview:
        compactText(args["content"], 110) ||
        (addressees.length > 0 ? `To ${addressees.join(", ")}` : "Channel message"),
    };
  }
  if (payload.name === "inspect_subagent") {
    return {
      displayName: "Inspect Subagent",
      preview: `${compactText(args["query"] ?? details?.["query"] ?? "status", 44)}${runId ? ` for ${runId}` : ""}`,
    };
  }
  if (payload.name === "merge_subagent") {
    return {
      displayName: "Merge Subagent",
      preview: runId ? `Merge changes from ${runId}` : "Merge changes",
    };
  }
  const preview = formatInvocationPreview(payload.arguments, payload.execution.description, 120);
  return { displayName: formatDisplayName(payload.name), preview };
}
