/**
 * The status line: model, thinking level, context use, approval level,
 * connection, agent activity and unread forks, in priority order so the
 * least important parts drop first on a narrow terminal.
 */
import { paint, style, truncate, width } from "./ansi.js";
import { APPROVAL_CHOICES } from "./commands.js";

export interface StatusInfo {
  connection: "connected" | "connecting" | "disconnected";
  /** The chat's own join state, when the transport is up. */
  joined: boolean;
  model: string | null;
  thinkingLevel: string | null;
  fastMode: boolean | null;
  contextPercent: number | null;
  approvalLevel: 0 | 1 | 2 | null;
  agentCount: number;
  busy: boolean;
  /** An agent's turn is parked on a decision only the person can make. */
  waitingForYou: boolean;
  unreadForks: number;
  queued: number;
  title: string | null;
}

export function statusLine(info: StatusInfo, columns: number): string {
  const sep = style.gray(" │ ");
  const parts: Array<{ text: string; priority: number }> = [];
  const connection =
    info.connection === "connected"
      ? info.joined
        ? style.green("● online")
        : style.yellow("◌ joining")
      : info.connection === "connecting"
        ? style.yellow("◌ reconnecting")
        : style.red("○ offline");
  parts.push({ text: connection, priority: 0 });
  if (info.agentCount === 0) parts.push({ text: style.gray("no agent yet"), priority: 1 });
  else
    parts.push({
      text: info.waitingForYou
        ? style.yellow("◆ waiting for you")
        : info.busy
          ? style.cyan("◆ working")
          : style.gray("◇ idle"),
      priority: 1,
    });
  if (info.model) parts.push({ text: style.bold(info.model) + (info.fastMode ? style.yellow(" fast") : ""), priority: 2 });
  if (info.thinkingLevel) parts.push({ text: `thinking ${info.thinkingLevel}`, priority: 4 });
  if (info.contextPercent !== null) {
    const pct = info.contextPercent;
    const tone = pct >= 90 ? "red" : pct >= 75 ? "yellow" : "gray";
    parts.push({ text: paint(`ctx ${pct}%`, tone), priority: 3 });
  }
  if (info.approvalLevel !== null) {
    const choice = APPROVAL_CHOICES.find((c) => c.value === info.approvalLevel)!;
    parts.push({ text: `approval ${choice.word}`, priority: 5 });
  }
  if (info.queued > 0) parts.push({ text: style.yellow(`${info.queued} queued`), priority: 2 });
  if (info.unreadForks > 0) parts.push({ text: style.magenta(`⑂ ${info.unreadForks} unread`), priority: 3 });
  if (info.agentCount > 1) parts.push({ text: `${info.agentCount} agents`, priority: 6 });
  if (info.title) parts.push({ text: style.gray(info.title), priority: 7 });

  // Drop the lowest-priority parts until the line fits.
  const kept = [...parts];
  const measure = () => width(kept.map((p) => p.text).join(sep));
  while (kept.length > 1 && measure() > columns) {
    let worst = 0;
    for (let i = 1; i < kept.length; i++) if (kept[i]!.priority > kept[worst]!.priority) worst = i;
    kept.splice(worst, 1);
  }
  return truncate(kept.map((p) => p.text).join(sep), columns);
}
