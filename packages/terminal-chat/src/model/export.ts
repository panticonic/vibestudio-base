/**
 * Conversation → Markdown, for /export. Messages keep their Markdown; tool
 * calls, thinking and notices become compact quoted lines so the export reads
 * as the conversation, not as a log.
 */
import type { ChatMessage } from "@workspace/agentic-core";
import type { ChatParticipants } from "@workspace/agentic-core/chat-store";
import {
  toolPresentation,
  extractFileMutationDetails,
} from "@workspace/agentic-core/chat-presentation";
import { participantName, rowKind } from "./transcript.js";

export function exportMarkdown(options: {
  title: string | null;
  channelId: string;
  messages: readonly ChatMessage[];
  participants: ChatParticipants;
  selfId: string | null;
  exportedAt: Date;
}): string {
  const { messages, participants, selfId } = options;
  const out: string[] = [
    `# ${options.title || "Conversation"}`,
    "",
    `_Exported ${options.exportedAt.toISOString()} from conversation \`${options.channelId}\`._`,
    "",
  ];
  for (const msg of messages) {
    const kind = rowKind(msg, selfId);
    const who =
      msg.senderId === selfId
        ? "You"
        : participantName(msg.senderId, participants, msg.senderMetadata);
    switch (kind) {
      case "user":
      case "agent":
        if (msg.retracted) continue;
        out.push(
          `## ${who}${msg.model ? ` (${msg.model.displayName || msg.model.ref})` : ""}`,
          "",
          msg.content.trim(),
          ""
        );
        for (const attachment of msg.attachments ?? [])
          out.push(`- Attachment: ${attachment.name ?? attachment.id} (${attachment.mimeType})`);
        if (msg.attachments?.length) out.push("");
        break;
      case "thinking":
        if (msg.content.trim())
          out.push(
            "<details><summary>Thinking</summary>",
            "",
            msg.content.trim(),
            "",
            "</details>",
            ""
          );
        break;
      case "tool": {
        const payload = msg.invocation!;
        const { displayName, preview } = toolPresentation(payload);
        const mutation = extractFileMutationDetails(payload.execution.result);
        out.push(`> **${displayName}** ${preview} — ${payload.execution.status}`);
        for (const op of mutation?.operations ?? []) {
          if (op.diff)
            out.push(
              ">",
              "> ```diff",
              ...op.diff
                .trimEnd()
                .split("\n")
                .map((line) => `> ${line}`),
              "> ```"
            );
        }
        out.push("");
        break;
      }
      case "task":
        out.push(
          `> **${msg.task!.subagent ? "Subagent" : "Task"}** ${msg.task!.subagent?.label || msg.task!.title} — ${msg.task!.execution.status}`,
          ""
        );
        break;
      case "approval":
        out.push(`> Approval ${msg.approval!.status}: ${msg.approval!.question ?? ""}`, "");
        break;
      case "diagnostic":
        out.push(
          `> ⚠ ${msg.diagnostic!.title}${msg.diagnostic!.detail ? ` — ${msg.diagnostic!.detail}` : ""}`,
          ""
        );
        break;
      case "typing":
        break;
      default:
        if (msg.content.trim()) out.push(`> ${msg.content.trim().replace(/\n/g, "\n> ")}`, "");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

export function exportFileName(title: string | null, channelId: string, at: Date): string {
  const slug =
    (title || channelId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "conversation";
  return `${slug}-${at.toISOString().slice(0, 19).replace(/[:T]/g, "")}.md`;
}
