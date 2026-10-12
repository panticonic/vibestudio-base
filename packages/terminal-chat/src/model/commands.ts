/**
 * Slash commands: the table, parsing and inline completion. The same table
 * feeds the Ctrl-K palette and /help, so every action is reachable and
 * documented in one place. Execution is bound by the app (`actions.ts`).
 */

export type CommandName =
  | "model"
  | "thinking"
  | "fast"
  | "approval"
  | "respond"
  | "connect"
  | "agents"
  | "new"
  | "resume"
  | "fork"
  | "forks"
  | "title"
  | "missions"
  | "retry"
  | "export"
  | "attach"
  | "queue"
  | "help";

export interface CommandSpec {
  name: CommandName;
  /** Argument syntax shown in completions and help, e.g. "<provider>". */
  args?: string;
  summary: string;
}

export const COMMANDS: readonly CommandSpec[] = [
  { name: "model", args: "[model]", summary: "Switch the agent's model (opens a picker without an argument)" },
  { name: "thinking", args: "[level]", summary: "Set how much the agent thinks before answering" },
  { name: "fast", args: "[on|off]", summary: "Toggle fast mode for the agent's model" },
  { name: "approval", args: "[ask|safe|auto]", summary: "How much the agents may do without asking you" },
  { name: "respond", args: "[policy]", summary: "When the agent answers: every message, or only when mentioned" },
  { name: "connect", args: "<provider>", summary: "Connect a model provider account" },
  { name: "agents", args: "[add|replace|remove]", summary: "See, add, replace or remove agents in this chat" },
  { name: "new", summary: "Start a new conversation" },
  { name: "resume", summary: "Resume another conversation in this workspace context" },
  { name: "fork", summary: "Fork the conversation at its latest message" },
  { name: "forks", summary: "Show the fork tree and switch between forks" },
  { name: "title", args: "<title>", summary: "Rename this conversation" },
  { name: "missions", args: "[run|pause|resume <name>]", summary: "List and control automations" },
  { name: "retry", summary: "Retry or resume the agent's last failed turn" },
  { name: "export", summary: "Export this conversation as Markdown" },
  { name: "attach", summary: "Attach a file from your computer to the next message" },
  { name: "queue", summary: "Show queued messages: edit, undo or discard them" },
  { name: "help", summary: "Keys and commands" },
];

export function findCommand(name: string): CommandSpec | undefined {
  const lower = name.toLowerCase();
  return COMMANDS.find((command) => command.name === lower);
}

export type ParsedInput =
  | { kind: "message"; text: string }
  | { kind: "command"; command: CommandSpec; args: string }
  | { kind: "unknown-command"; name: string };

/**
 * Classify a draft. `/name args` is a command; a leading `//` sends the text
 * with one slash removed, so messages can still start with "/".
 */
export function parseInput(text: string): ParsedInput {
  if (text.startsWith("//")) return { kind: "message", text: text.slice(1) };
  const match = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return { kind: "message", text };
  const command = findCommand(match[1]!);
  if (!command) return { kind: "unknown-command", name: match[1]! };
  return { kind: "command", command, args: (match[2] ?? "").trim() };
}

/** Fuzzy subsequence score (higher is better); null when `query` does not match. */
export function fuzzyScore(query: string, candidate: string): number | null {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (!q) return 0;
  if (c.startsWith(q)) return 1000 - c.length;
  const at = c.indexOf(q);
  if (at >= 0) return 500 - at;
  let score = 0;
  let index = 0;
  for (const char of q) {
    const found = c.indexOf(char, index);
    if (found < 0) return null;
    score += found === index ? 5 : 1;
    index = found + 1;
  }
  return score;
}

export function rankByFuzzy<T>(items: readonly T[], query: string, text: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

export interface Completion {
  /** Replaces the draft when accepted. */
  insert: string;
  label: string;
  detail?: string;
  /** Accepting runs the command immediately (no further arguments needed). */
  runs?: boolean;
}

/** Argument values the app knows about right now, for argument completion. */
export interface CompletionData {
  models: ReadonlyArray<{ ref: string; label: string; detail?: string }>;
  providers: ReadonlyArray<{ id: string; label: string }>;
  thinkingLevels: readonly string[];
  respondPolicies: readonly string[];
  missions: ReadonlyArray<{ name: string; status: string }>;
}

export const APPROVAL_CHOICES = [
  { value: 0, word: "ask", label: "Ask for everything" },
  { value: 1, word: "safe", label: "Auto-approve safe actions" },
  { value: 2, word: "auto", label: "Full auto" },
] as const;

export function approvalFromArg(arg: string): 0 | 1 | 2 | null {
  const lower = arg.toLowerCase();
  for (const choice of APPROVAL_CHOICES) {
    if (lower === choice.word || lower === String(choice.value)) return choice.value;
  }
  return null;
}

/**
 * Completions for the draft at the cursor. Only offered while the cursor is
 * at the end of a single-line draft that starts with "/".
 */
export function completeCommand(draft: string, data: CompletionData): Completion[] {
  if (!draft.startsWith("/") || draft.startsWith("//") || draft.includes("\n")) return [];
  const space = draft.indexOf(" ");
  if (space === -1) {
    const query = draft.slice(1);
    return rankByFuzzy(COMMANDS, query, (command) => command.name).map((command) => ({
      insert: `/${command.name}${command.args ? " " : ""}`,
      label: `/${command.name}${command.args ? ` ${command.args}` : ""}`,
      detail: command.summary,
      runs: !command.args,
    }));
  }
  const command = findCommand(draft.slice(1, space));
  if (!command) return [];
  const arg = draft.slice(space + 1);
  const options = argumentOptions(command.name, arg, data);
  // Match the value (what gets inserted); fall back to labels ("claude" finds a model by name).
  const query = arg.trim();
  const byValue = rankByFuzzy(options, query, (option) => option.value);
  const matches = byValue.length > 0 ? byValue : rankByFuzzy(options, query, (option) => option.label);
  return matches.map((option) => ({
    insert: `/${command.name} ${option.value}`,
    label: option.value,
    detail: option.label,
    runs: true,
  }));
}

function argumentOptions(name: CommandName, arg: string, data: CompletionData): Array<{ value: string; label: string }> {
  switch (name) {
    case "model":
      return data.models.map((model) => ({ value: model.ref, label: model.detail ? `${model.label} · ${model.detail}` : model.label }));
    case "connect":
      return data.providers.map((provider) => ({ value: provider.id, label: provider.label }));
    case "thinking":
      return data.thinkingLevels.map((level) => ({ value: level, label: `thinking ${level}` }));
    case "fast":
      return [
        { value: "on", label: "Fast mode on" },
        { value: "off", label: "Fast mode off" },
      ];
    case "approval":
      return APPROVAL_CHOICES.map((choice) => ({ value: choice.word, label: choice.label }));
    case "respond":
      return data.respondPolicies.map((policy) => ({ value: policy, label: respondPolicyLabel(policy) }));
    case "agents":
      return [
        { value: "add", label: "Add another agent" },
        { value: "replace", label: "Replace an agent (new model or type)" },
        { value: "remove", label: "Remove an agent from this chat" },
      ];
    case "missions": {
      const [verb] = arg.trimStart().split(/\s+/);
      if (verb && ["run", "pause", "resume"].includes(verb) && arg.includes(" ")) {
        return data.missions.map((mission) => ({ value: `${verb} ${mission.name}`, label: mission.status }));
      }
      return [
        { value: "run", label: "Run an automation now" },
        { value: "pause", label: "Pause an automation" },
        { value: "resume", label: "Resume a paused automation" },
      ];
    }
    default:
      return [];
  }
}

export function respondPolicyLabel(policy: string): string {
  switch (policy) {
    case "all":
      return "Answer every message";
    case "mentioned":
      return "Answer when @mentioned (or the only agent)";
    case "mentioned-strict":
      return "Answer only when @mentioned";
    case "mentioned-or-followup":
      return "Answer when @mentioned or following up";
    case "from-participants":
      return "Answer messages from chosen participants";
    default:
      return policy;
  }
}
