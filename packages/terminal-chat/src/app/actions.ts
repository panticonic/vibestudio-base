/**
 * What the slash commands, the palette and the transcript keys do. Each
 * action reads the current stores, calls the chat core, and reports failures
 * as notices that say what failed and what to do next.
 */
import type { ChatMessage } from "@workspace/agentic-core";
import { AGENT_THINKING_LEVELS, modelSwitchConfigFromSettings } from "@workspace/agentic-core";
import type { ChatSession, ForkUiState } from "@workspace/agentic-core/chat-store";
import { isModelUsable } from "@workspace/model-catalog/catalog";
import { RESPOND_POLICIES } from "@workspace/agentic-protocol";
import { createMissionsClient } from "@vibestudio/service-schemas/clients/missionsClient";
import type { AttachmentInput } from "@workspace/pubsub";
import {
  APPROVAL_CHOICES,
  COMMANDS,
  approvalFromArg,
  respondPolicyLabel,
  type CommandName,
} from "../model/commands.js";
import { agentsIn, parseAgentSettings, type AgentInfo } from "../model/agents.js";
import { exportFileName, exportMarkdown } from "../model/export.js";
import type { PickerItem, PickerState } from "../model/overlays.js";
import { isUsageLimit } from "../model/transcript.js";
import type { ChatRuntime } from "../runtime/chatRuntime.js";
import { ProviderSignIn } from "../runtime/providerSignIn.js";

export interface PromptSpec {
  title: string;
  hint?: string;
  initial: string;
  multiline?: boolean;
  submitLabel?: string;
  onSubmit(text: string): void | Promise<void>;
}

/** What actions may do to the screen. */
export interface ActionUi {
  openPicker(picker: Omit<PickerState, "query" | "index" | "filterable"> & { filterable?: boolean; index?: number }, onPick: (item: PickerItem) => void): void;
  openPrompt(prompt: PromptSpec): void;
  openHelp(): void;
  openQueue(): void;
  closeOverlay(): void;
  setDraft(text: string): void;
  addAttachment(attachment: AttachmentInput & { name: string }): void;
  copy(text: string, what: string): void;
  /** Agent settings changed; refresh what the status line shows. */
  settingsChanged(): void;
}

export class ChatActions {
  constructor(
    private readonly runtime: ChatRuntime,
    private readonly ui: ActionUi
  ) {}

  private get session(): ChatSession | null {
    return this.runtime.getSnapshot().session;
  }

  private agents(): AgentInfo[] {
    const snapshot = this.session?.getSnapshot();
    return snapshot ? agentsIn(snapshot.participants, snapshot.selfId) : [];
  }

  private requireSession(what: string): ChatSession | null {
    const session = this.session;
    if (!session || !session.getSnapshot().connected) {
      this.runtime.notify({ tone: "warning", title: `Can't ${what} yet`, message: "The conversation is still connecting. Try again in a moment; the status line shows when it is online." });
      return null;
    }
    return session;
  }

  /** Run `fn` against the single agent, or ask which agent first. */
  private withAgent(what: string, fn: (agent: AgentInfo) => void | Promise<void>): void {
    const agents = this.agents();
    if (agents.length === 0) {
      this.runtime.notify({ tone: "info", title: `No agent to ${what}`, message: "Send a message to start one, or add one with /agents add." });
      return;
    }
    if (agents.length === 1) {
      void this.guard(what, () => fn(agents[0]!));
      return;
    }
    this.ui.openPicker(
      {
        title: `Which agent? (${what})`,
        items: agents.map((agent) => ({ id: agent.id, label: agent.name, detail: agent.handle ? `@${agent.handle}` : undefined })),
        empty: "No agents.",
      },
      (item) => {
        const agent = agents.find((a) => a.id === item.id);
        if (agent) void this.guard(what, () => fn(agent));
      }
    );
  }

  private async guard(what: string, fn: () => unknown): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.runtime.fail(`Couldn't ${what}`, error);
    }
  }

  // ── slash commands ─────────────────────────────────────────────────────────

  run(name: CommandName, args: string): void {
    switch (name) {
      case "model":
        return this.model(args);
      case "thinking":
        return this.thinking(args);
      case "fast":
        return this.fast(args);
      case "approval":
        return this.approval(args);
      case "respond":
        return this.respond(args);
      case "connect":
        return this.connect(args);
      case "agents":
        return this.agentsCommand(args);
      case "new":
        void this.guard("start a new conversation", () => this.runtime.newConversation());
        return;
      case "resume":
        return void this.resume();
      case "fork":
        return this.fork();
      case "forks":
        return void this.forks();
      case "title":
        return this.title(args);
      case "missions":
        return void this.missions(args);
      case "retry":
        return this.retryLatest();
      case "export":
        return void this.export();
      case "attach":
        return this.attach(args);
      case "queue":
        return this.ui.openQueue();
      case "help":
        return this.ui.openHelp();
    }
  }

  /** The palette: every command, plus a few key-only actions. */
  openPalette(extra: Array<{ id: string; label: string; detail: string; run(): void }>): void {
    const items: PickerItem[] = [
      ...extra.map((item) => ({ id: `extra:${item.id}`, label: item.label, detail: item.detail })),
      ...COMMANDS.map((command) => ({ id: `cmd:${command.name}`, label: `/${command.name}`, detail: command.summary })),
    ];
    this.ui.openPicker({ title: "Command palette", items, empty: "No matching command.", filterable: true }, (item) => {
      if (item.id.startsWith("extra:")) {
        extra.find((e) => `extra:${e.id}` === item.id)?.run();
        return;
      }
      const name = item.id.slice(4) as CommandName;
      const spec = COMMANDS.find((c) => c.name === name)!;
      // Commands that need an argument the picker cannot supply open their own pickers.
      if (spec.args?.startsWith("<") && name !== "connect" && name !== "title") this.ui.setDraft(`/${name} `);
      else this.run(name, "");
    });
  }

  // ── model & settings ───────────────────────────────────────────────────────

  private model(arg: string): void {
    const catalog = this.runtime.getSnapshot().host?.modelCatalog;
    if (!catalog) {
      this.runtime.notify({ tone: "warning", title: "Models are still loading", message: "Try /model again in a moment." });
      return;
    }
    const choose = (ref: string) => this.setModel(ref);
    if (arg) {
      const match = catalog.models.find((m) => m.ref === arg) ?? catalog.models.find((m) => m.ref.endsWith(`:${arg}`) || m.name.toLowerCase() === arg.toLowerCase());
      if (!match) {
        this.runtime.notify({ tone: "error", title: `No model called "${arg}"`, message: "Type /model and pick from the list." });
        return;
      }
      choose(match.ref);
      return;
    }
    const current = this.currentModelRef();
    const items: PickerItem[] = catalog.models.map((m) => {
      const state = m.availability?.state ?? "needs-setup";
      const usable = isModelUsable(m);
      const provider = catalog.providers.find((p) => p.id === m.provider)?.label ?? m.provider;
      return {
        id: m.ref,
        label: m.name,
        detail: `${provider}${usable ? "" : ` · ${state === "needs-setup" ? "connect with /connect " + m.provider : state}`}${m.recommended ? " · recommended" : ""}`,
        disabled: !usable,
        current: m.ref === current,
      };
    });
    items.sort((a, b) => Number(a.disabled ?? false) - Number(b.disabled ?? false));
    this.ui.openPicker({ title: "Choose a model", items, empty: "No models are configured. Connect a provider with /connect.", filterable: true, hint: "Models you can't use yet need their provider connected first." }, (item) => {
      const model = catalog.models.find((m) => m.ref === item.id);
      if (model && !isModelUsable(model)) {
        if (ProviderSignIn.unsupportedReason(model.provider) === null) void this.runtime.signIn.connect(model.provider);
        else this.runtime.notify({ tone: "warning", title: `${model.name} isn't ready`, message: ProviderSignIn.unsupportedReason(model.provider) ?? undefined });
        return;
      }
      choose(item.id);
    });
  }

  private currentModelRef(): string | null {
    const deferred = this.session?.deferredAgent.getSnapshot().deferredAgent;
    if (this.agents().length === 0 && deferred) return deferred.draft.model || null;
    return null;
  }

  /** Before the first agent: set the draft. With one agent: recreate it on the new model, keeping its settings. */
  setModel(ref: string): void {
    const session = this.session;
    const deferred = session?.deferredAgent.getSnapshot().deferredAgent;
    if (this.agents().length === 0) {
      if (deferred) {
        deferred.setDraft({ ...deferred.draft, model: ref });
        this.runtime.notify({ tone: "success", title: `Model set to ${this.modelName(ref)}`, message: "Your first message starts the agent on it." });
        if (deferred.queued.length > 0 && (deferred.modelSelectionRequired || deferred.setupRequired)) deferred.startQueued();
      } else {
        this.runtime.notify({ tone: "warning", title: "Can't choose a model yet", message: "The conversation is still connecting." });
      }
      return;
    }
    this.withAgent("switch the model", async (agent) => {
      const settings = await this.runtime.callAgent(agent.id, "getAgentSettings", {});
      await session!.replaceAgent(agent.id, undefined, modelSwitchConfigFromSettings(settings, ref, agent.handle ?? undefined));
      this.runtime.notify({ tone: "success", title: `Switched to ${this.modelName(ref)}`, message: "The agent restarted on the new model and keeps the conversation." });
      this.ui.settingsChanged();
    });
  }

  private modelName(ref: string): string {
    return this.runtime.getSnapshot().host?.modelCatalog?.models.find((m) => m.ref === ref)?.name ?? ref;
  }

  private thinking(arg: string): void {
    const apply = (level: string) => {
      const deferred = this.session?.deferredAgent.getSnapshot().deferredAgent;
      if (this.agents().length === 0 && deferred) {
        deferred.setDraft({ ...deferred.draft, thinkingLevel: level as never });
        this.runtime.notify({ tone: "success", title: `Thinking: ${level}`, message: "Applies to the agent your first message starts." });
        return;
      }
      this.withAgent("change thinking", async (agent) => {
        await this.runtime.callAgent(agent.id, "setThinkingLevel", { level });
        this.runtime.notify({ tone: "success", title: `Thinking: ${level}` });
        this.ui.settingsChanged();
      });
    };
    if (arg) {
      if (!AGENT_THINKING_LEVELS.includes(arg as never)) {
        this.runtime.notify({ tone: "error", title: `"${arg}" is not a thinking level`, message: `Use one of: ${AGENT_THINKING_LEVELS.join(", ")}.` });
        return;
      }
      apply(arg);
      return;
    }
    this.ui.openPicker({ title: "Thinking level", items: AGENT_THINKING_LEVELS.map((level) => ({ id: level, label: level })), empty: "" }, (item) => apply(item.id));
  }

  private fast(arg: string): void {
    const value = arg === "on" ? true : arg === "off" ? false : null;
    if (arg && value === null) {
      this.runtime.notify({ tone: "error", title: "Use /fast on or /fast off" });
      return;
    }
    this.withAgent("change fast mode", async (agent) => {
      const current = parseAgentSettings(await this.runtime.callAgent(agent.id, "getAgentSettings", {}));
      const enabled = value ?? !current.fastMode;
      await this.runtime.callAgent(agent.id, "setFastMode", { enabled });
      this.runtime.notify({ tone: "success", title: `Fast mode ${enabled ? "on" : "off"}` });
      this.ui.settingsChanged();
    });
  }

  private approval(arg: string): void {
    const apply = async (level: 0 | 1 | 2) => {
      const session = this.requireSession("change approvals");
      const client = session?.getSnapshot().client;
      if (!client) return;
      await this.guard("change the approval level", async () => {
        await client.updateChannelConfig({ approvalLevel: level });
        this.runtime.notify({ tone: "success", title: `Approvals: ${APPROVAL_CHOICES[level].label}` });
        this.ui.settingsChanged();
      });
    };
    if (arg) {
      const level = approvalFromArg(arg);
      if (level === null) {
        this.runtime.notify({ tone: "error", title: `"${arg}" is not an approval level`, message: "Use ask, safe or auto." });
        return;
      }
      void apply(level);
      return;
    }
    this.ui.openPicker({ title: "What may agents do without asking you?", items: APPROVAL_CHOICES.map((c) => ({ id: String(c.value), label: c.word, detail: c.label })), empty: "" }, (item) => void apply(Number(item.id) as 0 | 1 | 2));
  }

  private respond(arg: string): void {
    const apply = (policy: string) =>
      this.withAgent("change when the agent answers", async (agent) => {
        await this.runtime.callAgent(agent.id, "setRespondPolicy", { policy });
        this.runtime.notify({ tone: "success", title: respondPolicyLabel(policy) });
        this.ui.settingsChanged();
      });
    if (arg) {
      if (!RESPOND_POLICIES.includes(arg as never)) {
        this.runtime.notify({ tone: "error", title: `"${arg}" is not a respond policy`, message: `Use one of: ${RESPOND_POLICIES.join(", ")}.` });
        return;
      }
      apply(arg);
      return;
    }
    this.ui.openPicker({ title: "When should the agent answer?", items: RESPOND_POLICIES.map((p) => ({ id: p, label: p, detail: respondPolicyLabel(p) })), empty: "" }, (item) => apply(item.id));
  }

  connect(providerId: string): void {
    if (providerId) {
      void this.runtime.signIn.connect(providerId);
      return;
    }
    const catalog = this.runtime.getSnapshot().host?.modelCatalog;
    const providers = ProviderSignIn.providers();
    this.ui.openPicker(
      {
        title: "Connect a model provider",
        items: providers.map((p) => {
          const unsupported = ProviderSignIn.unsupportedReason(p.id);
          const connected = catalog?.models.some((m) => m.provider === p.id && isModelUsable(m));
          return { id: p.id, label: p.label, detail: unsupported ? "use the desktop app (API key)" : connected ? "connected" : undefined, disabled: !!unsupported, current: !!connected };
        }),
        empty: "No providers are known to this workspace.",
        filterable: true,
      },
      (item) => {
        const reason = ProviderSignIn.unsupportedReason(item.id);
        if (reason) this.runtime.notify({ tone: "warning", title: `Can't connect ${item.label} here`, message: reason });
        else void this.runtime.signIn.connect(item.id);
      }
    );
  }

  // ── agents ─────────────────────────────────────────────────────────────────

  private agentsCommand(arg: string): void {
    const session = this.requireSession("manage agents");
    if (!session) return;
    const verb = arg.split(/\s+/)[0] ?? "";
    const available = this.runtime.getSnapshot().host?.availableAgents ?? [];
    const pickType = (title: string, then: (agentId: string) => void) =>
      this.ui.openPicker({ title, items: available.map((a) => ({ id: a.id, label: a.name, detail: a.description })), empty: "No agent types are available in this workspace." }, (item) => then(item.id));
    if (verb === "add") {
      pickType("Add which kind of agent?", (agentId) => void this.guard("add the agent", async () => {
        await session.addAgent(agentId);
        this.runtime.notify({ tone: "success", title: "Agent added", message: "It joins in a moment; @mention it to address it." });
      }));
      return;
    }
    if (verb === "remove") {
      this.withAgent("remove the agent", async (agent) => {
        await session.removeAgent(agent.handle ?? agent.id);
        this.runtime.notify({ tone: "success", title: `${agent.name} removed` });
      });
      return;
    }
    if (verb === "replace") {
      this.withAgent("replace the agent", (agent) =>
        pickType(`Replace ${agent.name} with`, (agentId) => void this.guard("replace the agent", () => session.replaceAgent(agent.id, agentId)))
      );
      return;
    }
    const agents = this.agents();
    this.ui.openPicker(
      {
        title: "Agents in this conversation",
        items: [
          ...agents.map((a) => ({ id: `agent:${a.id}`, label: a.name, detail: [a.handle ? `@${a.handle}` : "", a.activeModel ?? "", a.contextPercent !== null ? `ctx ${a.contextPercent}%` : "", a.typing ? "working" : ""].filter(Boolean).join(" · ") })),
          { id: "add", label: "+ Add an agent", detail: "/agents add" },
          ...(agents.length ? [{ id: "replace", label: "⇄ Replace an agent", detail: "/agents replace" }, { id: "remove", label: "− Remove an agent", detail: "/agents remove" }] : []),
        ],
        empty: "",
      },
      (item) => {
        if (item.id === "add" || item.id === "replace" || item.id === "remove") this.agentsCommand(item.id);
      }
    );
  }

  // ── conversations & forks ──────────────────────────────────────────────────

  private async resume(): Promise<void> {
    try {
      const listings = await this.runtime.listConversations();
      this.ui.openPicker(
        {
          title: "Resume a conversation",
          hint: "Conversations in this workspace context, newest first. Detached terminal tabs are resumed from the terminal browser instead.",
          items: listings.map((l) => ({ id: l.channelId, label: l.channelId, detail: new Date(l.createdAt).toISOString().slice(0, 16).replace("T", " "), current: l.current })),
          empty: "No other conversations here yet. /new starts one.",
          filterable: true,
        },
        (item) => {
          const listing = listings.find((l) => l.channelId === item.id);
          if (listing && !listing.current) void this.guard("open the conversation", () => this.runtime.openConversation(listing.channelId, listing.contextId));
        }
      );
    } catch (error) {
      this.runtime.fail("Couldn't list conversations", error, "Check the connection (status line) and try /resume again.");
    }
  }

  private forksStore(): { state: ForkUiState } | null {
    const forks = this.session?.forks;
    return forks ? { state: forks.getSnapshot() } : null;
  }

  private fork(): void {
    const forks = this.forksStore();
    if (!forks) return;
    void this.guard("fork the conversation", async () => {
      await forks.state.actions.newFork();
      this.runtime.notify({ tone: "success", title: "Forked", message: "You are in the new fork. /forks switches back." });
    });
  }

  forkFrom(message: ChatMessage): void {
    const forks = this.forksStore();
    if (!forks) return;
    void this.guard("fork here", () => forks.state.actions.forkFromMessage(message));
  }

  editAndFork(message: ChatMessage): void {
    const forks = this.forksStore();
    if (!forks) return;
    this.ui.openPrompt({
      title: "Edit your message into a new fork",
      hint: "The fork continues from just before this message, with your edited text in its place. The original conversation stays as it is.",
      initial: message.content,
      multiline: true,
      submitLabel: "Fork",
      onSubmit: (text) => this.guard("edit and fork", () => forks.state.actions.editAndForkMessage(message, text)),
    });
  }

  private async forks(): Promise<void> {
    const forks = this.forksStore();
    if (!forks) return;
    forks.state.refresh();
    try {
      const tree = await forks.state.loadTree();
      const items: PickerItem[] = [];
      const walk = (nodes: typeof tree, depth: number) => {
        for (const node of nodes) {
          items.push({ id: `${node.contextId ?? ""}|${node.channelId}`, label: node.label || node.channelId, detail: `${node.provenanceKind}${node.unread ? " · unread" : ""}`, current: node.isCurrent, depth });
          walk(node.children, depth + 1);
        }
      };
      walk(tree, 0);
      this.ui.openPicker({ title: "Forks", items, empty: "This conversation has no forks. /fork creates one.", hint: "Enter switches to a fork." }, (item) => {
        const [contextId, channelId] = item.id.split("|");
        if (!item.current && channelId && contextId) void forks.state.actions.switchTo(channelId, contextId);
      });
    } catch (error) {
      this.runtime.fail("Couldn't load the fork tree", error);
    }
  }

  private title(arg: string): void {
    const session = this.requireSession("rename the conversation");
    const client = session?.getSnapshot().client;
    if (!client) return;
    const apply = (title: string) =>
      this.guard("rename the conversation", async () => {
        await client.updateChannelConfig({ title: title.trim(), titleExplicit: true });
        this.runtime.notify({ tone: "success", title: `Renamed to "${title.trim()}"` });
      });
    if (arg) void apply(arg);
    else this.ui.openPrompt({ title: "Rename this conversation", initial: session!.getSnapshot().channelTitle ?? "", onSubmit: apply });
  }

  // ── missions ───────────────────────────────────────────────────────────────

  private async missions(arg: string): Promise<void> {
    const client = createMissionsClient(this.runtime.rpc);
    const [verb, ...rest] = arg.split(/\s+/).filter(Boolean);
    const name = rest.join(" ");
    try {
      const missions = await client.list();
      const find = (query: string) => missions.find((m) => m.name.toLowerCase() === query.toLowerCase() || m.missionId === query);
      const act = async (mission: (typeof missions)[number], action: "run" | "pause" | "resume") => {
        if (action === "run") await client.runNow(mission.missionId);
        else if (action === "pause") await client.pause(mission.missionId);
        else await client.resume(mission.missionId);
        this.runtime.notify({ tone: "success", title: `${action === "run" ? "Started" : action === "pause" ? "Paused" : "Resumed"} "${mission.name}"` });
      };
      if (verb === "run" || verb === "pause" || verb === "resume") {
        if (name) {
          const mission = find(name);
          if (!mission) {
            this.runtime.notify({ tone: "error", title: `No automation called "${name}"`, message: "/missions lists them." });
            return;
          }
          await act(mission, verb);
          return;
        }
      }
      this.ui.openPicker(
        {
          title: "Automations",
          items: missions.map((m) => ({ id: m.missionId, label: m.name, detail: `${m.state}${m.nextRunAt ? ` · next ${new Date(m.nextRunAt).toISOString().slice(0, 16).replace("T", " ")}` : ""} · ${m.runCount} run${m.runCount === 1 ? "" : "s"}` })),
          empty: "No automations yet. Ask the agent to set one up.",
          filterable: true,
          hint: verb ? `Choose one to ${verb}.` : "Enter opens actions for an automation.",
        },
        (item) => {
          const mission = missions.find((m) => m.missionId === item.id);
          if (!mission) return;
          if (verb === "run" || verb === "pause" || verb === "resume") {
            void this.guard(`${verb} the automation`, () => act(mission, verb));
            return;
          }
          this.ui.openPicker(
            { title: mission.name, items: [{ id: "run", label: "Run now" }, { id: mission.state === "paused" ? "resume" : "pause", label: mission.state === "paused" ? "Resume" : "Pause" }], empty: "" },
            (choice) => void this.guard(`${choice.id} the automation`, () => act(mission, choice.id as "run" | "pause" | "resume"))
          );
        }
      );
    } catch (error) {
      this.runtime.fail("Couldn't reach automations", error, "Check the connection and try /missions again.");
    }
  }

  // ── retry / resume ─────────────────────────────────────────────────────────

  /** /retry: resume after the latest failed or interrupted turn. */
  private retryLatest(): void {
    const messages = this.session?.getSnapshot().messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      if (msg.diagnostic || msg.lifecycle?.status === "interrupted") {
        this.retry(msg);
        return;
      }
    }
    const deferred = this.session?.deferredAgent.getSnapshot().deferredAgent;
    if (deferred?.launchFailed) {
      deferred.retryLaunch();
      return;
    }
    if (deferred?.queued.some((q) => q.status === "failed")) {
      deferred.retryDelivery();
      return;
    }
    this.runtime.notify({ tone: "info", title: "Nothing to retry", message: "There is no failed turn in this conversation." });
  }

  retry(message: ChatMessage): void {
    const agentId = message.senderId;
    void this.guard("resume the agent", async () => {
      await this.runtime.callAgent(agentId, "resume", {});
      this.runtime.notify({ tone: "success", title: "Resuming", message: "The agent picks up where it stopped." });
    });
  }

  scheduleResume(message: ChatMessage): void {
    const diagnostic = message.diagnostic;
    if (!diagnostic?.resetAt || !diagnostic.messageId || !isUsageLimit(message)) {
      this.runtime.notify({ tone: "info", title: "This message has no reset time to wait for", message: "Press r to retry now." });
      return;
    }
    void this.guard("schedule the resume", async () => {
      const result = (await this.runtime.callAgent(message.senderId, "scheduleResumeAtReset", { messageId: diagnostic.messageId, resetAt: diagnostic.resetAt })) as { scheduled?: boolean } | undefined;
      if (result?.scheduled === false) throw new Error("The agent declined to schedule it.");
      this.runtime.notify({ tone: "success", title: "The agent resumes when the limit resets" });
    });
  }

  connectFor(message: ChatMessage): void {
    const request = message.credentialRequest;
    if (!request) return;
    void (async () => {
      const connected = await this.runtime.signIn.connect(request.providerId);
      if (connected) await this.guard("resume the agent", () => this.runtime.callAgent(request.agentParticipantId, "resume", {}));
    })();
  }

  // ── export & attach ────────────────────────────────────────────────────────

  private async export(): Promise<void> {
    const snapshot = this.session?.getSnapshot();
    if (!snapshot?.channelName) {
      this.runtime.notify({ tone: "info", title: "Nothing to export yet" });
      return;
    }
    const at = new Date();
    const markdown = exportMarkdown({ title: snapshot.channelTitle, channelId: snapshot.channelName, messages: snapshot.messages, participants: snapshot.allParticipants, selfId: snapshot.selfId, exportedAt: at });
    try {
      const path = await this.runtime.files.writeExport(exportFileName(snapshot.channelTitle, snapshot.channelName, at), markdown);
      this.runtime.notify({ tone: "success", title: "Exported", message: path });
    } catch (error) {
      this.runtime.fail("Couldn't write the export", error, "Copy it instead: select a message (Ctrl-↑) and press y, or check that the workspace is writable.");
    }
  }

  attach(path: string): void {
    const read = (value: string) =>
      this.guard("attach the file", async () => {
        const file = await this.runtime.files.read(value.trim());
        if (file.bytes.byteLength > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
        this.ui.addAttachment({ name: file.name, mimeType: file.mimeType, data: file.bytes });
      });
    if (path) void read(path);
    else this.ui.openPrompt({ title: "Attach a file", hint: "Path of a file in the workspace (relative paths start at the workspace root). It is sent with your next message.", initial: "", onSubmit: read });
  }
}
