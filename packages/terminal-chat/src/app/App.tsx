/**
 * The terminal chat screen. It subscribes to the chat core's stores, routes
 * input, and lays the screen out as lines (see `screen.ts`); Ink draws them
 * and places the real cursor in the composer.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box, Text, useApp, useCursor } from "ink";
import type { ChatMessage } from "@workspace/agentic-core";
import { deriveActiveOutbox } from "@workspace/agentic-core/chat-presentation";
import {
  ChildTranscriptStore,
  type ChildTranscriptSnapshot,
} from "@workspace/agentic-core/chat-store";
import { isModelUsable } from "@workspace/model-catalog/catalog";
import {
  applyEdit,
  completeMention,
  editorFor,
  emptyEditor,
  mentionAt,
  type EditCommand,
  type EditorState,
} from "../model/composer.js";
import { completeCommand, parseInput, type Completion } from "../model/commands.js";
import {
  agentsIn,
  busyAgentIds,
  mentionCandidates,
  mentionIds,
  parseAgentSettings,
  type AgentSettings,
} from "../model/agents.js";
import { createForm, formClick, formReduce, renderForm, type FormState } from "../model/forms.js";
import { resolveBinding, type Mode } from "../model/keymap.js";
import { key, type InputEvent, type KeyEvent, type MouseEvent } from "../model/keys.js";
import {
  movePicker,
  pickerVisibleItems,
  type PickerItem,
  type PickerState,
  type QueueItem,
} from "../model/overlays.js";
import {
  awaitedDecision,
  isExpandable,
  messageActions,
  renderRow,
  rowKind,
  type RowContext,
  type RowKind,
} from "../model/transcript.js";
import {
  FOLLOW,
  computeWindow,
  revealRow,
  rowSource,
  scrollBy,
  type ScrollState,
} from "../model/viewport.js";
import type { ChatRuntime } from "../runtime/chatRuntime.js";
import type { ChatHostSurface, HostSurfaceState } from "../runtime/hostSurface.js";
import { attentionSequence, copySequence, hyperlink, titleSequence } from "../terminal/escapes.js";
import { useInputEvents, useStore, useTerminalSize, type InputSource } from "../ui/hooks.js";
import { ChatActions, type CurrentSettings, type PromptSpec } from "./actions.js";
import { layoutScreen, type Screen, type ScreenModel } from "./screen.js";
import { CardHost, type CardEnvironment } from "../cards/cardHost.js";
import { cardSpec } from "../cards/cardSpec.js";
import { keyBytes } from "../cards/keyBytes.js";
import { createChatSandboxValue } from "@workspace/agentic-core/chat-store";
import { sanitize, wrap } from "../model/ansi.js";

export interface TerminalChatProps {
  runtime: ChatRuntime;
  input: InputSource;
  /** Writes control sequences (title, attention, clipboard) to the terminal. */
  control: (sequence: string) => void;
  /** How the terminal opens its approvals overlay, as shown in approval cards. */
  approvalsKey?: string;
  /** Host chrome drawn over the chat (see `ChatHostSurface`); absent for launchers with none. */
  surface?: ChatHostSurface;
}

const CLOSED_SURFACE: HostSurfaceState = { view: null, attention: null };
const NO_SURFACE = { getSnapshot: () => CLOSED_SURFACE, subscribe: () => () => {} };

type Overlay =
  | { kind: "picker"; picker: PickerState; onPick: (item: PickerItem) => void }
  | { kind: "prompt"; prompt: PromptSpec; editor: EditorState }
  | { kind: "help"; scroll: number }
  | {
      kind: "detail";
      title: string;
      lines: (columns: number) => readonly string[];
      copyText: string;
      scroll: number;
    }
  | { kind: "queue"; index: number };

const EMPTY_SESSION = null;
const IDLE_DEFERRED = { deferredAgent: undefined };

export function TerminalChatApp({
  runtime,
  input,
  control,
  approvalsKey = "Ctrl-B a",
  surface,
}: TerminalChatProps) {
  const size = useTerminalSize();
  const hostSurface = useSyncExternalStore(
    (surface ?? NO_SURFACE).subscribe,
    (surface ?? NO_SURFACE).getSnapshot
  );
  const rt = useStore(runtime, runtime.getSnapshot());
  const session = rt.session;
  const chat = useStore(session, EMPTY_SESSION);
  const deferred = useStore(session?.deferredAgent, IDLE_DEFERRED).deferredAgent;
  const forks = useStore(session?.forks, null);
  const signIn = useStore(runtime.signIn, runtime.signIn.getSnapshot());
  const { setCursorPosition } = useCursor();
  const { exit } = useApp();

  const [mode, setMode] = useState<Mode>("compose");
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuDismissedFor, setMenuDismissedFor] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scroll, setScroll] = useState<ScrollState>(FOLLOW);
  const [escArmed, setEscArmed] = useState(false);
  /** Ctrl-C found nothing left to clear or stop; the next consecutive one quits. */
  const [quitArmed, setQuitArmed] = useState(false);
  const attachments = rt.composer.attachments;
  const [focused, setFocused] = useState(true);
  const [form, setForm] = useState<{
    id: string;
    state: FormState;
    scroll: number | null;
  } | null>(null);
  const [settings, setSettings] = useState<{
    agentId: string;
    settings: AgentSettings;
  } | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [approvalLevel, setApprovalLevel] = useState<0 | 1 | 2 | null>(null);
  const [childVersion, setChildVersion] = useState(0);

  // Reset per-conversation view state when the conversation changes.
  useEffect(() => {
    setMode("compose");
    setOverlay(null);
    setExpanded(new Set());
    setSelectedId(null);
    setScroll(FOLLOW);
    setSettings(null);
  }, [rt.generation]);

  // The composer's text is the store's draft; the editor keeps the cursor.
  const draft = chat?.input ?? "";
  useEffect(() => setEditor((current) => editorFor(draft, current)), [draft]);
  const setDraft = (next: EditorState) => {
    setEditor(next);
    session?.setInput(next.text);
  };

  const currentSettings = useRef<CurrentSettings>({
    model: null,
    thinkingLevel: null,
    fastMode: null,
    approvalLevel: null,
    respondPolicy: null,
  });
  const actions = useMemo(
    () =>
      new ChatActions(runtime, {
        openPicker: (picker, onPick) =>
          setOverlay({
            kind: "picker",
            picker: {
              query: "",
              index: picker.index ?? 0,
              filterable: picker.filterable ?? false,
              ...picker,
            },
            onPick,
          }),
        openPrompt: (prompt) =>
          setOverlay({
            kind: "prompt",
            prompt,
            editor: editorFor(prompt.initial),
          }),
        openHelp: () => setOverlay({ kind: "help", scroll: 0 }),
        openQueue: () => setOverlay({ kind: "queue", index: 0 }),
        closeOverlay: () => setOverlay(null),
        setDraft: (text) => {
          setEditor(editorFor(text));
          runtime.getSnapshot().session?.setInput(text);
        },
        copy: (text, what) => copy(text, what),
        settingsChanged: () => setSettingsVersion((v) => v + 1),
        currentSettings: () => currentSettings.current,
        quit: () => exit(),
        selectMessage: (id) => {
          setMode("select");
          setSelectedId(id);
          setScroll({ mode: "anchored", id, line: 0 });
        },
      }),
    [runtime]
  );

  function copy(text: string, what: string) {
    control(copySequence(text));
    runtime.notify({
      tone: "success",
      title: `Copied ${what}`,
      message:
        "Sent to your terminal's clipboard (OSC 52); terminals that block clipboard access ignore it.",
    });
  }

  // ── derived data ───────────────────────────────────────────────────────────
  const selfId = chat?.selfId ?? null;
  const participants = chat?.allParticipants ?? {};
  const agents = useMemo(
    () => (chat ? agentsIn(chat.participants, chat.selfId) : []),
    [chat?.participants, chat?.selfId]
  );
  const outbox = useMemo(
    () => (chat ? deriveActiveOutbox(chat.messages, chat.selfId, chat.participants) : []),
    [chat?.messages, chat?.selfId, chat?.participants]
  );
  const outboxIds = useMemo(() => new Set(outbox.map((m) => m.id)), [outbox]);
  const transcript = useMemo(() => {
    const messages = chat?.messages ?? [];
    // A parked turn shows its wait; a "working" row beside it would say the opposite.
    const waiting = new Set(
      messages
        .filter((m) => m.contentType === "lifecycle" && m.lifecycle?.status === "waiting")
        .map((m) => m.senderId)
    );
    return messages.filter(
      (m) =>
        !(m.contentType === "typing" && waiting.has(m.senderId)) &&
        !outboxIds.has(m.id) &&
        !(
          rowKind(m, chat?.selfId ?? null) === "notice" &&
          !m.content &&
          !m.automation &&
          m.contentType !== "inline_ui" &&
          m.contentType !== "custom"
        )
    );
  }, [chat?.messages, outboxIds, chat?.selfId]);
  const history = useMemo(
    () =>
      (chat?.messages ?? [])
        .filter(
          (m) => m.senderId === selfId && !m.contentType && m.kind !== "system" && m.content.trim()
        )
        .map((m) => m.content)
        .reverse(),
    [chat?.messages, selfId]
  );
  const busyIds = useMemo(
    () => busyAgentIds(chat?.messages ?? [], agents),
    [chat?.messages, agents]
  );
  const primaryAgent = agents[0] ?? null;

  // Agent settings for the status line: re-read when the agent changes or after we change them.
  useEffect(() => {
    if (!primaryAgent || !chat?.connected) return;
    let cancelled = false;
    runtime
      .callAgent(primaryAgent.id, "getAgentSettings", {})
      .then((raw) => {
        if (!cancelled)
          setSettings({
            agentId: primaryAgent.id,
            settings: parseAgentSettings(raw),
          });
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [primaryAgent?.id, primaryAgent?.activeModel, chat?.connected, settingsVersion]);

  // The channel-wide approval level.
  useEffect(() => {
    const client = chat?.client;
    if (!client) return;
    return client.onConfigChange((config) => {
      const level = config.approvalLevel;
      setApprovalLevel(level === 0 || level === 1 || level === 2 ? level : 2);
    });
  }, [chat?.client]);

  // Forms: show the oldest pending one.
  const pendingForm = rt.forms[0] ?? null;
  useEffect(() => {
    if (!pendingForm) setForm(null);
    else if (form?.id !== pendingForm.id)
      setForm({
        id: pendingForm.id,
        state: createForm(pendingForm.args),
        scroll: null,
      });
  }, [pendingForm?.id]);

  // Child transcripts of expanded subagent cards.
  const children = useRef(
    new Map<string, { store: ChildTranscriptStore; release: () => void; off: () => void }>()
  );
  const expandedTasks = transcript.filter(
    (m) => m.task?.subagent?.taskChannelId && (expandAll || expanded.has(m.id))
  );
  const expandedTaskKey = expandedTasks.map((m) => m.id).join("|");
  useEffect(() => {
    const live = children.current;
    const wanted = new Set(expandedTasks.map((m) => m.id));
    for (const [id, entry] of live) {
      if (!wanted.has(id)) {
        entry.off();
        entry.release();
        live.delete(id);
      }
    }
    if (!session) return;
    for (const msg of expandedTasks) {
      if (live.has(msg.id)) continue;
      const store = new ChildTranscriptStore({
        connection: {
          config: session.options.config,
          metadata: session.metadata,
        },
        channelId: msg.task!.subagent!.taskChannelId!,
        contextId: msg.task!.subagent!.contextId ?? null,
      });
      const off = store.subscribe(() => setChildVersion((v) => v + 1));
      live.set(msg.id, { store, release: store.retain(), off });
    }
  }, [expandedTaskKey, session]);
  useEffect(
    () => () => {
      for (const entry of children.current.values()) {
        entry.off();
        entry.release();
      }
      children.current.clear();
    },
    []
  );

  // Attention: a finished turn, a question or a sign-in request while the terminal is unfocused.
  const wasBusy = useRef(false);
  const busy = busyIds.length > 0 || !!chat?.agentBusy;
  useEffect(() => {
    if (wasBusy.current && !busy && !focused) control(attentionSequence("The agent finished"));
    wasBusy.current = busy;
  }, [busy, focused]);
  const needsYou = useMemo(
    () => transcript.map(awaitedDecision).filter((d): d is string => d !== null),
    [transcript]
  );
  const attentionKey = `${rt.forms.length}|${needsYou.length}|${transcript.filter((m) => m.contentType === "credential-connect").length}`;
  const lastAttentionKey = useRef(attentionKey);
  useEffect(() => {
    const [forms, approvals, credentials] = attentionKey.split("|").map(Number);
    const [pForms, pApprovals, pCredentials] = lastAttentionKey.current.split("|").map(Number);
    lastAttentionKey.current = attentionKey;
    if (focused) return;
    if (forms! > pForms!) control(attentionSequence("An agent is asking you a question"));
    else if (approvals! > pApprovals!) control(attentionSequence("An agent needs your approval"));
    else if (credentials! > pCredentials!)
      control(attentionSequence("An agent needs a provider connected"));
  }, [attentionKey, focused]);

  // ── transcript rows ────────────────────────────────────────────────────────
  const gutter = 2;
  // Cards: live Ink trees drawn into their rows (MDX messages, inline UI).
  const [, setCardVersion] = useState(0);
  const cardHost = useRef<CardHost | null>(null);
  cardHost.current ??= new CardHost(runtime.cardCompiler, () => setCardVersion((v) => v + 1));
  const cards = cardHost.current;
  useEffect(() => () => cards.dispose(), [cards]);
  /** The card that has the keyboard, by message id. */
  const [cardFocus, setCardFocus] = useState<string | null>(null);
  const channelId = session?.options.channelName ?? null;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  // The `chat` cards receive: the panel's own implementation over this session.
  const cardChat = useMemo(
    () =>
      createChatSandboxValue({
        client: () => session?.client ?? null,
        publishText: (text, options) =>
          session
            ? session.publishText(text, options)
            : Promise.reject(new Error("The conversation is not connected yet.")),
        focusMessage: async (messageId) => {
          if (!transcriptRef.current.some((m) => m.id === messageId)) return false;
          setMode("select");
          setSelectedId(messageId);
          return true;
        },
        contextId: rt.contextId,
        channelId,
        // Read when a card calls, never while rendering: a render can run
        // inside a conversation switch, when the old conversation is closed.
        rpc: { call: (...args) => runtime.rpc.call(...args) },
      }),
    [session, channelId, rt.contextId, runtime]
  );
  const cardScope = useMemo(() => (session ? runtime.cardScope : null), [session, runtime]);
  const cardEnvironment = useMemo<CardEnvironment | null>(() => {
    if (!cardScope) return null;
    // Answered state comes from the durable transcript, as in the panel.
    const answers = new Map<string, { text: string; values?: string[] }>();
    for (const message of transcript) {
      const interaction = message.interaction;
      if (!interaction || message.error || message.pending) continue;
      answers.set(`${interaction.source}\u0000${interaction.targetId}`, {
        text: message.content,
        ...(interaction.values ? { values: interaction.values } : {}),
      });
    }
    return {
      actions: {
        send: (text, options) =>
          cardChat.send(
            text,
            options?.interaction ? { metadata: { interaction: options.interaction } } : undefined
          ),
        answer: (source, targetId) => answers.get(`${source}\u0000${targetId}`),
      },
      chat: cardChat,
      scope: cardScope.current,
      scopes: cardScope.api,
      openers: {
        openPanel: (url) => runtime.cardRuntime.openPanel(url, { focus: true }),
        openExternal: (url, options) => runtime.cardRuntime.openExternal(url, options),
      },
      onFailure: (key, spec, phase, error) => {
        // An inline UI's author hears that it failed here, as from the panel.
        const msg = transcript.find((m) => m.id === key);
        if (spec.kind !== "inline" || !msg) return;
        void runtime
          .reportCardFailure(
            { kind: msg.senderMetadata?.type ?? "agent", id: msg.senderId },
            {
              category: phase === "compile" ? "compile_failed" : "render_failed",
              refs: {
                inlineUiId: spec.id,
                ...(msg.inlineUi?.turnId ? { turnId: msg.inlineUi.turnId as never } : {}),
              },
              error,
              occurrenceKey: [
                "inline_ui",
                phase,
                spec.id,
                msg.inlineUi?.renderedAt ?? "",
                error.message,
              ].join(":"),
            }
          )
          .catch((cause) =>
            runtime.fail("A card's failure could not be reported to its agent", cause)
          );
      },
    };
  }, [transcript, runtime, cardChat, cardScope]);
  useEffect(() => {
    if (cardEnvironment) cards.setEnvironment(cardEnvironment);
  }, [cards, cardEnvironment]);
  useEffect(() => {
    const live = new Set(transcript.filter((m) => cardSpec(m, selfId)).map((m) => m.id));
    cards.retain(live);
    if (cardFocus && !live.has(cardFocus)) setCardFocus(null);
  }, [transcript, selfId, cards, cardFocus]);
  const rowCtx: RowContext = {
    selfId,
    participants,
    columns: size.columns - gutter,
    approvalsKey,
    card: (msg) => {
      const spec = cardSpec(msg, selfId);
      return spec ? cards.view(msg.id, spec, Math.max(20, size.columns - gutter) - 2) : null;
    },
  };
  const isRowExpanded = (msg: ChatMessage) =>
    isExpandable(msg, selfId) && expandAll !== expanded.has(msg.id);
  const childLinesFor = (msg: ChatMessage): string[] | undefined => {
    const entry = children.current.get(msg.id);
    if (!entry) return undefined;
    const snapshot: ChildTranscriptSnapshot = entry.store.getSnapshot();
    if (snapshot.failure || snapshot.error)
      return [`! ${snapshot.failure?.title ?? snapshot.error}`];
    const ctx: RowContext = {
      ...rowCtx,
      columns: rowCtx.columns - 4,
      selfId: snapshot.selfId,
      participants: snapshot.participants,
    };
    return snapshot.messages
      .filter((m) => m.contentType !== "typing")
      .flatMap((m) => renderRow(m, ctx, false));
  };
  void childVersion;
  const source = rowSource(
    transcript,
    (m) => m.id,
    (m, index) => {
      const kind = rowKind(m, selfId);
      const lines = renderRow(
        m,
        rowCtx,
        isRowExpanded(m),
        m.task && isRowExpanded(m) ? childLinesFor(m) : undefined
      );
      return opensWithBlank(index, kind) ? ["", ...lines] : lines;
    }
  );
  const selectedIndex = selectedId ? source.indexOf(selectedId) : -1;
  const selectedMessage = selectedIndex >= 0 ? transcript[selectedIndex]! : null;

  // ── input ──────────────────────────────────────────────────────────────────
  const completions: Completion[] = useMemo(() => {
    if (mode !== "compose" || overlay || menuDismissedFor === editor.text) return [];
    if (editor.text.startsWith("/") && editor.cursor === editor.text.length) {
      const catalog = rt.host?.modelCatalog;
      return completeCommand(editor.text, {
        models: (catalog?.models ?? []).filter(isModelUsable).map((m) => ({
          ref: m.ref,
          label: m.name,
          detail: catalog?.providers.find((p) => p.id === m.provider)?.label,
        })),
        providers:
          catalog?.providers
            .filter((p) => p.connectable)
            .map((p) => ({ id: p.id, label: p.label })) ?? [],
        thinkingLevels: ["minimal", "low", "medium", "high", "xhigh", "max"],
        respondPolicies: ["all", "mentioned", "mentioned-strict", "mentioned-or-followup"],
        missions: [],
      });
    }
    const mention = mentionAt(editor);
    if (mention) {
      return mentionCandidates(mention.query, participants, selfId).map((c) => ({
        insert: c.handle,
        label: `@${c.handle}`,
        detail: c.name,
      }));
    }
    return [];
  }, [editor, mode, overlay, menuDismissedFor, rt.host?.modelCatalog, participants, selfId]);
  const menuOpen = completions.length > 0;
  useEffect(() => setMenuIndex(0), [completions.length, editor.text.split(" ")[0]]);

  const viewportRows = useRef(10);
  /** The last laid-out screen, for hit testing clicks against what is shown. */
  const screen = useRef<Screen | null>(null);
  const overlayRows = useRef(10);
  const page = Math.max(1, viewportRows.current - 2);

  function moveSelection(delta: number) {
    if (transcript.length === 0) return;
    const current = selectedIndex >= 0 ? selectedIndex : transcript.length;
    const next = Math.max(0, Math.min(transcript.length - 1, current + delta));
    setSelectedId(transcript[next]!.id);
    setScroll((s) => revealRow(source, viewportRows.current, s, next));
    if (next === 0 && chat?.hasMoreHistory && !chat.loadingMore)
      void session?.loadEarlierMessages();
  }

  function scrollPage(delta: number) {
    setScroll((s) => {
      const next = scrollBy(source, viewportRows.current, s, delta);
      if (
        computeWindow(source, viewportRows.current, next).atTop &&
        chat?.hasMoreHistory &&
        !chat.loadingMore
      )
        void session?.loadEarlierMessages();
      return next;
    });
  }

  async function send(afterTurn: boolean) {
    const text = editor.text;
    const parsed = parseInput(text);
    if (parsed.kind === "unknown-command") {
      runtime.notify({
        tone: "error",
        title: `There is no /${parsed.name} command`,
        message:
          "Type / to see the commands, or start with // to send a message that begins with a slash.",
      });
      return;
    }
    if (parsed.kind === "command") {
      setDraft(emptyEditor);
      actions.run(parsed.command.name, parsed.args);
      return;
    }
    if (!session) return;
    if (!parsed.text.trim() && attachments.length === 0) return;
    if (parsed.text !== text) session.setInput(parsed.text);
    setScroll(FOLLOW);
    try {
      await runtime.submit(parsed.text, {
        mentions: mentionIds(parsed.text, chat?.participants ?? {}, selfId),
        ...(afterTurn ? { metadata: { deliverAfterTurn: true } } : {}),
      });
    } catch (error) {
      runtime.fail(
        "Your message wasn't sent",
        error,
        "It is back in the composer. Check the connection and press Enter to try again."
      );
    }
  }

  function interrupt() {
    if (busyIds.length === 0) {
      runtime.notify({
        tone: "info",
        title: "Nothing to stop",
        message: "No agent is working right now.",
      });
      return;
    }
    for (const id of busyIds) {
      const agent = agents.find((a) => a.id === id);
      void session
        ?.interruptAgent(id, undefined, agent?.handle ?? undefined)
        .catch((error) => runtime.fail("Couldn't stop the agent", error));
    }
  }

  function toggleRow(msg: ChatMessage) {
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.add(msg.id);
      return next;
    });
  }

  function paletteExtras() {
    return [
      {
        id: "interrupt",
        label: "Stop the agent",
        detail: "Esc",
        run: interrupt,
      },
      {
        id: "flush",
        label: "Send queued messages now and stop the agent",
        detail: "Esc Esc",
        run: () => void session?.flushOutboxAndInterrupt(),
      },
      {
        id: "undo",
        label: "Undo cancelling queued messages",
        detail: chat?.undoableAction ? "available" : "nothing to undo",
        run: () => session?.undoLastAction(),
      },
      {
        id: "select",
        label: "Select messages in the transcript",
        detail: "Ctrl-↑",
        run: () => enterSelect(),
      },
      {
        id: "expand",
        label: expandAll ? "Collapse tool calls and thinking" : "Expand tool calls and thinking",
        detail: "Ctrl-O",
        run: () => setExpandAll((v) => !v),
      },
      {
        id: "retry-connection",
        label: "Reconnect the conversation",
        detail: chat?.connected ? "connected" : "offline",
        run: () => session?.reconnect("user-retry"),
      },
      {
        id: "diagnostics",
        label: "Show diagnostics",
        detail: "connection and library messages",
        run: () => {
          const lines = runtime.diagnostics.getSnapshot();
          setOverlay({
            kind: "picker",
            onPick: () => {},
            picker: {
              title: `Diagnostics (${lines.length}, newest first)`,
              items: [...lines].reverse().map((line, index) => ({
                id: String(index),
                label: `${new Date(line.at).toISOString().slice(11, 19)} ${line.level.padEnd(5)} ${line.text.split("\n")[0]}`,
              })),
              query: "",
              index: 0,
              filterable: true,
              empty: "Nothing has been logged.",
            },
          });
        },
      },
      {
        id: "retry-models",
        label: "Reload models and agents",
        detail: "",
        run: () => {
          runtime.controller?.retryModelSettings();
          runtime.controller?.retryAgentCatalog();
          runtime.controller?.retryAgentRecovery();
        },
      },
    ];
  }

  function enterSelect() {
    if (transcript.length === 0) return;
    setMode("select");
    const index = transcript.length - 1;
    setSelectedId(transcript[index]!.id);
    setScroll((s) => revealRow(source, viewportRows.current, s, index));
  }

  /** Take a completion; `run` runs a complete command, as Enter does. */
  function acceptCompletion(item: Completion, run: boolean) {
    if (editor.text.startsWith("/")) {
      if (run && item.runs) {
        const parsed = parseInput(item.insert.trim());
        setDraft(emptyEditor);
        if (parsed.kind === "command") actions.run(parsed.command.name, parsed.args);
        return;
      }
      setDraft(editorFor(item.insert));
    } else {
      setDraft(completeMention(editor, item.insert));
    }
  }

  /** Give a card the keyboard, its first control focused. */
  function enterCard(id: string) {
    setCardFocus(id);
    cards.input(id, "\t");
  }

  function backToComposer() {
    setMode("compose");
    setSelectedId(null);
    setScroll(FOLLOW);
  }

  /**
   * Clicks do what the clicked thing's key or pick does, through the same
   * handlers; the wheel scrolls whatever is in front.
   */
  function handleMouse(event: MouseEvent): void {
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      const up = event.action === "wheel-up";
      if ((form && pendingForm) || overlay?.kind === "help" || overlay?.kind === "detail")
        return handleInput(key(up ? "pageup" : "pagedown"));
      if (overlay) return handleInput(key(up ? "up" : "down"));
      if (signIn.phase !== "idle") return;
      return scrollPage(up ? -3 : 3);
    }
    if (event.action !== "press" || event.button !== 0) return;
    if (signIn.phase !== "idle") return;
    const target = screen.current?.hits.find(
      (hit) => hit.y === event.y && event.x >= hit.x0 && event.x < hit.x1
    )?.target;
    if (!target) return;
    if (form && pendingForm) {
      if (target.kind !== "form") return;
      const next = formClick(form.state, pendingForm.args, target.hit);
      setForm({ id: form.id, state: next.state, scroll: form.scroll });
      if (next.result) pendingForm.answer(next.result);
      return;
    }
    switch (target.kind) {
      case "key":
        return handleInput(target.key);
      case "command":
        return actions.run(target.name, "");
      case "completion":
        return completions[target.index] && acceptCompletion(completions[target.index]!, true);
      case "composer":
        return mode === "select" ? backToComposer() : undefined;
      case "latest":
        return backToComposer();
      case "form":
        return;
      case "row": {
        const msg = transcript[target.index];
        if (!msg) return;
        setMode("select");
        setSelectedId(msg.id);
        // A card row is a blank line (after the first row), the header, then
        // the card two columns into the row, which is two into the screen.
        if (cards.isLive(msg.id)) {
          const top = (opensWithBlank(target.index, rowKind(msg, selfId)) ? 1 : 0) + 1;
          if (target.line >= top && cards.press(msg.id, event.x - gutter - 2, target.line - top)) {
            setCardFocus(msg.id);
            return;
          }
        }
        if (isExpandable(msg, selfId)) toggleRow(msg);
        return;
      }
      case "item": {
        if (overlay?.kind === "queue") return setOverlay({ kind: "queue", index: target.index });
        if (overlay?.kind !== "picker") return;
        const item = pickerVisibleItems(overlay.picker)[target.index];
        if (!item) return;
        setOverlay(null);
        overlay.onPick(item);
        return;
      }
    }
  }

  function handleComposeKey(event: KeyEvent) {
    if (menuOpen) {
      if (event.name === "up") return setMenuIndex((i) => Math.max(0, i - 1));
      if (event.name === "down")
        return setMenuIndex((i) => Math.min(completions.length - 1, i + 1));
      if (event.name === "escape") return setMenuDismissedFor(editor.text);
      if (event.name === "tab" || (event.name === "enter" && !event.meta && !event.shift))
        return acceptCompletion(
          completions[Math.min(menuIndex, completions.length - 1)]!,
          event.name === "enter"
        );
    }
    const action = resolveBinding("compose", event);
    if (action !== "interrupt") setEscArmed(false);
    if (action !== "clear-or-interrupt") setQuitArmed(false);
    switch (action) {
      case "send":
        return void send(false);
      case "send-after-turn":
        return void send(true);
      case "newline":
        return setDraft(applyEdit(editor, { kind: "newline" }));
      case "interrupt":
        if (escArmed) {
          setEscArmed(false);
          void session?.flushOutboxAndInterrupt();
        } else {
          setEscArmed(true);
          if (busyIds.length > 0) interrupt();
        }
        return;
      case "clear-or-interrupt":
        // Each Ctrl-C does the next thing: clear the draft, stop the agent,
        // then quit — a stubborn agent never keeps the person in.
        if (quitArmed) return exit();
        if (editor.text) return setDraft(emptyEditor);
        if (busyIds.length > 0) interrupt();
        setQuitArmed(true);
        runtime.notify({
          tone: "info",
          title: "Press Ctrl-C again to quit",
          message: "The conversation stays; the terminal's launcher or /resume reopens it.",
        });
        return;
      case "palette":
        return actions.openPalette(paletteExtras());
      case "attach":
        return actions.attach("");
      case "select-mode":
        return enterSelect();
      case "page-up":
        return scrollPage(-page);
      case "page-down":
        return scrollPage(page);
      case "toggle-all":
        return setExpandAll((v) => !v);
      case "latest":
        return setScroll(FOLLOW);
      case "settings":
        return actions.run("settings", "");
      case "quit":
        // Ctrl-D quits only from an empty draft; otherwise it deletes forward.
        if (!editor.text) return exit();
        break;
      case "help":
        return setOverlay({ kind: "help", scroll: 0 });
    }
    const command = editCommandFor(event, history);
    if (command) {
      setMenuDismissedFor(null);
      setDraft(applyEdit(editor, command));
    }
  }

  function handleSelectKey(event: KeyEvent) {
    const action = resolveBinding("select", event);
    const msg = selectedMessage;
    switch (action) {
      case "inspect":
        if (msg)
          setOverlay({
            kind: "detail",
            title: "Message details",
            lines: (columns) => renderRow(msg, { ...rowCtx, columns }, true),
            copyText: msg.content || JSON.stringify(msg.invocation ?? msg.task ?? msg, null, 2),
            scroll: 0,
          });
        return;
      case "select-up":
        return moveSelection(-1);
      case "select-down":
        if (selectedIndex === transcript.length - 1) {
          setMode("compose");
          setSelectedId(null);
          setScroll(FOLLOW);
          return;
        }
        return moveSelection(1);
      case "select-top":
        return moveSelection(-transcript.length);
      case "select-bottom":
        return moveSelection(transcript.length);
      case "page-up":
        return moveSelection(-5);
      case "page-down":
        return moveSelection(5);
      case "compose-mode":
        setMode("compose");
        setSelectedId(null);
        setScroll(FOLLOW);
        return;
      case "palette":
        return actions.openPalette(paletteExtras());
    }
    if (!msg) return;
    const available = new Set(messageActions(msg, selfId).map((a) => a.id));
    const unavailable = (what: string) =>
      runtime.notify({
        tone: "info",
        title: `Can't ${what} on this message`,
        message: hintFor(msg),
      });
    if (action === "toggle" && cards.isLive(msg.id)) return enterCard(msg.id);
    switch (action) {
      case "toggle":
        return available.has("toggle") ? toggleRow(msg) : unavailable("expand");
      case "fork":
        return available.has("fork") ? actions.forkFrom(msg) : unavailable("fork");
      case "edit-fork":
        return available.has("edit-fork") ? actions.editAndFork(msg) : unavailable("edit");
      case "retry":
        return available.has("retry") ? actions.retry(msg) : unavailable("retry");
      case "schedule-resume":
        return available.has("schedule-resume")
          ? actions.scheduleResume(msg)
          : unavailable("schedule a resume");
      case "connect":
        return available.has("connect") ? actions.connectFor(msg) : unavailable("connect");
      case "copy":
        return msg.content ? copy(msg.content, "the message") : unavailable("copy");
    }
  }

  function handleOverlayKey(current: Overlay, event: Exclude<InputEvent, MouseEvent>) {
    if (event.type === "focus") return;
    if (current.kind === "detail") {
      if (event.type !== "key") return;
      if (event.name === "escape" || event.text === "q") return setOverlay(null);
      if (event.text === "y") return copy(current.copyText, "the details");
      const room = Math.max(1, overlayRows.current - 3);
      const last = Math.max(0, current.lines(size.columns).length - room);
      const delta =
        event.name === "up"
          ? -1
          : event.name === "down"
            ? 1
            : event.name === "pageup"
              ? -room
              : event.name === "pagedown"
                ? room
                : 0;
      const next =
        event.name === "home"
          ? 0
          : event.name === "end"
            ? last
            : Math.max(0, Math.min(last, current.scroll + delta));
      setOverlay({ ...current, scroll: next });
      return;
    }
    if (current.kind === "picker") {
      const picker = current.picker;
      if (event.type === "paste") {
        if (picker.filterable)
          setOverlay({
            ...current,
            picker: {
              ...picker,
              query: picker.query + event.text.replace(/\s+/g, " "),
              index: 0,
            },
          });
        return;
      }
      if (event.name === "escape") return setOverlay(null);
      if (event.name === "up") return setOverlay({ ...current, picker: movePicker(picker, -1) });
      if (event.name === "down") return setOverlay({ ...current, picker: movePicker(picker, 1) });
      if (event.name === "pageup")
        return setOverlay({ ...current, picker: movePicker(picker, -10) });
      if (event.name === "pagedown")
        return setOverlay({ ...current, picker: movePicker(picker, 10) });
      if (event.name === "enter") {
        const item = pickerVisibleItems(picker)[picker.index];
        if (!item) return;
        setOverlay(null);
        current.onPick(item);
        return;
      }
      if (picker.filterable && event.name === "backspace")
        return setOverlay({
          ...current,
          picker: { ...picker, query: picker.query.slice(0, -1), index: 0 },
        });
      if (picker.filterable && event.name === "char" && !event.ctrl && !event.meta)
        return setOverlay({
          ...current,
          picker: { ...picker, query: picker.query + event.text, index: 0 },
        });
      return;
    }
    if (current.kind === "prompt") {
      if (event.type === "key" && event.name === "escape") return setOverlay(null);
      if (
        event.type === "key" &&
        event.name === "enter" &&
        !(current.prompt.multiline && (event.meta || event.shift))
      ) {
        setOverlay(null);
        void current.prompt.onSubmit(current.editor.text);
        return;
      }
      const command: EditCommand | null =
        event.type === "paste"
          ? { kind: "insert", text: event.text }
          : event.name === "enter" || (event.ctrl && event.text === "j")
            ? current.prompt.multiline
              ? { kind: "newline" }
              : null
            : editCommandFor(event, []);
      if (command) setOverlay({ ...current, editor: applyEdit(current.editor, command) });
      return;
    }
    if (event.type !== "key") return;
    if (current.kind === "help") {
      if (event.name === "escape" || event.text === "q" || event.name === "f1")
        return setOverlay(null);
      const delta =
        event.name === "up"
          ? -1
          : event.name === "down"
            ? 1
            : event.name === "pageup"
              ? -10
              : event.name === "pagedown"
                ? 10
                : 0;
      setOverlay({ kind: "help", scroll: Math.max(0, current.scroll + delta) });
      return;
    }
    if (current.kind === "queue") {
      const items = queueItems();
      const item = items[current.index];
      if (event.name === "escape" || event.text === "q") return setOverlay(null);
      if (event.name === "up")
        return setOverlay({
          kind: "queue",
          index: Math.max(0, current.index - 1),
        });
      if (event.name === "down")
        return setOverlay({
          kind: "queue",
          index: Math.min(items.length - 1, current.index + 1),
        });
      if (event.text === "u") return session?.undoLastAction();
      if (!item) return;
      if (event.name === "enter") {
        setOverlay({
          kind: "detail",
          title: "Queued message",
          lines: (columns) =>
            wrap(sanitize([item.text, ...(item.attachments ?? [])].join("\n")), columns),
          copyText: item.text,
          scroll: 0,
        });
        return;
      }
      if (event.text === "d") {
        void runtime.bindConversationCallback(async () => {
          if (deferred?.queued.some((q) => q.id === item.id)) await deferred.discardQueued(item.id);
          else await session?.cancelPendingMessage(item.id);
        })();
        return;
      }
      if (event.text === "r" && item.failed) {
        void runtime.bindConversationCallback(() => deferred?.retryDelivery(item.id))();
        return;
      }
      if (
        event.text === "c" &&
        deferred?.queued.find((q) => q.id === item.id)?.kind === "opening-request"
      ) {
        void runtime.bindConversationCallback(async () => {
          await deferred.discardQueued(item.id);
          runtime.assertConversationActive();
          session?.setInput(item.text);
          setOverlay(null);
        })();
        return;
      }
      if (event.text === "e") {
        const held = deferred?.queued.find((q) => q.id === item.id);
        if (held?.kind === "opening-request") {
          runtime.notify({
            tone: "info",
            title: "The retained opening request is not editable",
            message:
              "Press c to cancel the retained request and compose a replacement, or d to discard it.",
          });
          return;
        }
        if (held?.publication === "accepted" || held?.retirement !== undefined) {
          runtime.notify({
            tone: "info",
            title: "This entry only needs attachment cleanup",
            message:
              held.publication === "accepted"
                ? "The message was accepted. Press r to finish cleanup; it will not be sent again. Discarding does not recall it."
                : held.publication === "attempted"
                  ? "Delivery was attempted and may have been accepted. Press r or d to finish cleanup only; cleanup does not recall it."
                  : "This message was not sent. Press r or d to finish cleaning up its retained files.",
          });
          return;
        }
        if (held?.publication === "attempted") {
          runtime.notify({
            tone: "info",
            title: "This delivery is not editable",
            message:
              "It may already have been accepted. Press r to retry it unchanged, or d to stop retrying. Discarding does not recall it.",
          });
          return;
        }
        setOverlay({
          kind: "prompt",
          editor: editorFor(item.text),
          prompt: {
            title: "Edit the queued message",
            initial: item.text,
            multiline: true,
            onSubmit: runtime.bindConversationCallback(async (text) => {
              if (held && deferred) await deferred.editQueued(item.id, text);
              else await session?.editPendingMessage(item.id, text);
            }),
          },
        });
      }
    }
  }

  function queueItems(): QueueItem[] {
    const items: QueueItem[] = [];
    for (const q of deferred?.queued ?? []) {
      items.push({
        id: q.id,
        text: q.text,
        failed: q.status === "failed",
        attachments: q.attachmentSummaries?.map(
          (file) => `${file.name} · ${file.mimeType} · ${file.size} bytes`
        ),
        state:
          q.publication === "accepted" || q.retirement !== undefined
            ? `${q.publication === "accepted" ? "accepted" : q.publication === "attempted" ? "delivery uncertain" : "unsent"} · attachment cleanup ${q.status === "failed" ? "pending — r retries cleanup" : "in progress"}`
            : q.status === "failed"
              ? `failed: ${q.failure?.title ?? deferred?.deliveryError ?? "not delivered"}`
              : q.status === "delivering"
                ? "sending"
                : q.status === "waiting"
                  ? "waiting behind a failed message"
                  : "waiting for the first agent",
      });
    }
    for (const m of outbox) {
      items.push({
        id: m.id,
        text: m.content,
        failed: false,
        state: chat?.afterTurnMessageIds.has(m.id)
          ? "sends after the agent's turn"
          : "queued for the agent",
      });
    }
    return items;
  }

  useInputEvents(input, handleInput);
  function handleInput(event: InputEvent): void {
    if (surface?.handleInput(event)) return;
    if (event.type === "focus") {
      setFocused(event.focused);
      return;
    }
    if (event.type === "mouse") return handleMouse(event);
    // A pending agent question takes the keyboard.
    if (form && pendingForm) {
      if (event.type === "key" && (event.name === "pageup" || event.name === "pagedown")) {
        const rendered = renderForm(form.state, pendingForm.args, size.columns - 2);
        const room = Math.max(1, size.rows - 3);
        const last = Math.max(0, rendered.lines.length - room);
        const current =
          form.scroll ?? Math.max(0, Math.min(rendered.focusLine - Math.floor(room / 2), last));
        setForm({
          ...form,
          scroll: Math.max(0, Math.min(last, current + (event.name === "pageup" ? -room : room))),
        });
        return;
      }
      const next = formReduce(form.state, pendingForm.args, event);
      setForm({ id: form.id, state: next.state, scroll: null });
      if (next.result) pendingForm.answer(next.result);
      return;
    }
    if (signIn.phase !== "idle") {
      if (signIn.phase === "done" || signIn.phase === "error") {
        runtime.signIn.dismiss();
        return;
      }
      if (event.type === "paste" && signIn.phase === "waiting")
        return void runtime.signIn.paste(event.text);
      if (event.type === "key" && event.name === "escape")
        return void runtime.signIn
          .cancel()
          .catch((error) => runtime.fail("Provider sign-in cleanup failed", error));
      if (event.type === "key" && event.text === "y" && signIn.phase === "waiting")
        return copy(signIn.url, "the sign-in link");
      return;
    }
    if (overlay) return handleOverlayKey(overlay, event);
    if (cardFocus) {
      // Esc (or Ctrl-C) gives the keyboard back; everything else is the card's.
      if (event.type === "key" && (event.name === "escape" || (event.ctrl && event.text === "c")))
        return setCardFocus(null);
      const bytes = keyBytes(event);
      if (bytes) cards.input(cardFocus, bytes);
      return;
    }
    if (event.type === "paste") {
      if (mode === "select") setMode("compose");
      setMenuDismissedFor(null);
      setDraft(applyEdit(editor, { kind: "insert", text: event.text }));
      return;
    }
    if (
      rt.notices.length > 0 &&
      event.name === "escape" &&
      mode === "compose" &&
      !menuOpen &&
      busyIds.length === 0 &&
      !escArmed
    ) {
      runtime.dismissNotice();
      return;
    }
    if (mode === "select") handleSelectKey(event);
    else handleComposeKey(event);
  }

  // Window title follows the conversation title.
  useEffect(() => {
    control(titleSequence(chat?.channelTitle ? `${chat.channelTitle} — Chat` : "Chat"));
  }, [chat?.channelTitle]);

  // ── screen ─────────────────────────────────────────────────────────────────
  const host = rt.host;
  currentSettings.current = {
    model:
      primaryAgent?.activeModel ??
      modelNameFor(settings?.settings.model ?? deferred?.draft.model ?? null),
    thinkingLevel: settings?.settings.thinkingLevel ?? deferred?.draft.thinkingLevel ?? null,
    fastMode: settings?.settings.fastMode ?? null,
    approvalLevel,
    respondPolicy: settings?.settings.respondPolicy ?? null,
  };
  const model: ScreenModel = {
    size,
    transcript: {
      source,
      scroll,
      selectedIndex: mode === "select" ? selectedIndex : -1,
      loadingOlder: !!chat?.loadingMore,
      replaySettled: !!chat?.replaySettled,
      hasMore: !!chat?.hasMoreHistory,
      historyError: chat?.historyError ?? null,
    },
    empty: transcript.length === 0 ? emptyState() : null,
    overlay: overlay
      ? {
          overlay,
          queue: overlay.kind === "queue" ? queueItems() : [],
          undo: chat?.undoableAction ? "u undoes the last discard" : null,
        }
      : null,
    form:
      form && pendingForm
        ? { state: form.state, args: pendingForm.args, scroll: form.scroll }
        : null,
    signIn,
    notices: rt.notices,
    banners: banners(),
    outbox: queueItems(),
    menu: menuOpen
      ? {
          items: completions,
          index: Math.min(menuIndex, completions.length - 1),
        }
      : null,
    composer: {
      editor,
      attachments: attachments.map(
        (a) => a.name + (a.status === "releasing" ? " (cleanup pending)" : "")
      ),
      placeholder: placeholder(),
      mode,
      selectedActions: selectedMessage
        ? [
            ...(cards.isLive(selectedMessage.id)
              ? [
                  { key: "Enter", label: "use the card" },
                  ...messageActions(selectedMessage, selfId).filter((a) => a.id !== "toggle"),
                ]
              : messageActions(selectedMessage, selfId)),
          ]
        : null,
      card: cardFocus !== null,
    },
    status: {
      connection: rt.connection,
      joined: !!chat?.connected,
      model: currentSettings.current.model,
      thinkingLevel: currentSettings.current.thinkingLevel,
      fastMode: currentSettings.current.fastMode,
      contextPercent: primaryAgent?.contextPercent ?? null,
      approvalLevel,
      agentCount: agents.length,
      busy,
      waitingForYou: needsYou.length > 0,
      unreadForks: forks
        ? [...forks.children, ...forks.siblings].filter((f) => f.unread).length
        : 0,
      queued: outbox.length + (deferred?.queued.length ?? 0),
      title: chat?.channelTitle ?? null,
    },
    approvalsKey,
    linkify: hyperlink,
  };
  const laidOut = layoutScreen(model);
  screen.current = laidOut;
  viewportRows.current = laidOut.transcriptRows;
  overlayRows.current = laidOut.overlayRows;

  // Ink applies the cursor position given during render to the frame it commits.
  setCursorPosition(laidOut.cursor ?? undefined);

  function modelNameFor(ref: string | null): string | null {
    if (!ref) return null;
    return host?.modelCatalog?.models.find((m) => m.ref === ref)?.name ?? ref;
  }

  function placeholder(): string {
    if (!chat?.connected) return "Connecting…";
    if (hostSurface.attention) return `${hostSurface.attention} · you can still write here`;
    if (needsYou.length > 0)
      return `Waiting for you — ${approvalsKey} answers it · you can still write here`;
    if (agents.length === 0)
      return "Write your first message — an agent starts when you send it · F2 settings";
    if (busy)
      return "The agent is working — Enter steers it, Ctrl-S sends after its turn, Esc stops it";
    return "Message the agent · / for commands · @ to mention · F1 for help";
  }

  function emptyState(): ScreenModel["empty"] {
    const catalog = host?.modelCatalog;
    const usable = catalog?.models.filter(isModelUsable) ?? [];
    if (host && catalog && usable.length === 0) {
      return {
        title: "No model is ready yet",
        lines: [
          "Connect a model provider to start chatting:",
          "  1. /connect          choose a provider and sign in",
          "  2. /model            choose a model",
          "  3. type a message    an agent starts with your first message",
        ],
      };
    }
    if (host?.firstAgentModelPreflight === "selection-required") {
      return {
        title: "Choose a model to start",
        lines: [
          "There is no default model in this workspace yet. /model picks one;",
          "/connect adds a provider account.",
        ],
      };
    }
    return {
      title: chat?.replaySettled === false ? "Loading the conversation…" : "New conversation",
      lines: [
        "Ask anything. Tips:",
        "  /         commands (models, forks, automations, export…)",
        "  @name     address one agent       Ctrl-K   command palette",
        "  F2        agent settings: model, thinking, approvals",
        "  Ctrl-↑    select earlier messages  F1       all keys",
        "  Ctrl-D    quit (from an empty draft; also /quit) — the conversation stays",
        `  Approvals open in the terminal browser: ${approvalsKey}`,
      ],
    };
  }

  function banners(): ScreenModel["banners"] {
    const out: ScreenModel["banners"] = [];
    const error = chat?.connectionError;
    if (error)
      out.push({
        tone: "error",
        title: error.title,
        message: `${error.message}${error.retryable ? " Ctrl-K → Reconnect, or wait: it retries by itself." : ""}`,
      });
    if (host?.modelSettingsError)
      out.push({
        tone: "error",
        title: host.modelSettingsError.title,
        message: host.modelSettingsError.message,
      });
    if (host?.agentCatalogError)
      out.push({
        tone: "warning",
        title: host.agentCatalogError.title,
        message: host.agentCatalogError.message,
      });
    if (host?.recovery.status === "recovering")
      out.push({
        tone: "info",
        title: "Bringing your agents back…",
        message: "They rejoin the conversation in a moment.",
      });
    if (host?.recovery.status === "failed" && host.recovery.error)
      out.push({
        tone: "error",
        title: host.recovery.error.title,
        message: `${host.recovery.error.message} Ctrl-K → Reload models and agents, or Show diagnostics for the cause.`,
      });
    if (deferred?.launchStage && deferred.launchStage !== "ready") {
      const label =
        deferred.launchStage === "failed"
          ? (deferred.launchError?.title ?? "Your agent couldn't start")
          : stageLabel(deferred.launchStage);
      out.push({
        tone: deferred.launchStage === "failed" ? "error" : "info",
        title: label,
        message:
          deferred.launchStage === "failed"
            ? `${deferred.launchError?.message ?? ""} /retry tries again.`
            : "",
      });
    }
    if (deferred?.setupRequired)
      out.push({
        tone: "warning",
        title: deferred.setupRequired.title,
        message: `${deferred.setupRequired.message} /model chooses a model; /connect adds a provider.`,
      });
    else if (deferred?.modelSelectionRequired && deferred.queued.length > 0)
      out.push({
        tone: "warning",
        title: "Choose a model for your agent",
        message: "Your message is waiting. /model picks one.",
      });
    if (forks?.error) out.push({ tone: "error", title: "Fork failed", message: forks.error });
    if (chat?.flushNarration)
      out.push({ tone: "info", title: chat.flushNarration.text, message: "" });
    if (chat?.undoableAction)
      out.push({
        tone: "info",
        title: "Queued message cancelled",
        message: "Ctrl-K → Undo brings it back.",
      });
    return out;
  }

  if (hostSurface.view) {
    setCursorPosition(undefined);
    return hostSurface.view(size);
  }
  return (
    <Box flexDirection="column" width={size.columns}>
      {laidOut.lines.map((line, index) => (
        <Text key={index} wrap="truncate-end">
          {line || " " /* an empty Text has no height */}
        </Text>
      ))}
    </Box>
  );
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "preparing-model":
      return "Preparing the model for your agent…";
    case "creating-agent":
      return "Creating your agent…";
    case "joining":
      return "Your agent is joining…";
    default:
      return stage;
  }
}

/** What the person can do on the selected row, for the hint line. */
function hintFor(msg: ChatMessage): string {
  const actions = messageActions(msg, null);
  return actions.length
    ? actions.map((a) => `${a.key} ${a.label}`).join(" · ")
    : "Nothing to do on this message";
}

/** Editing keys of the composer (and of prompt fields). */
export function editCommandFor(event: KeyEvent, history: readonly string[]): EditCommand | null {
  if (event.name === "char" && !event.ctrl && !event.meta)
    return { kind: "insert", text: event.text };
  if (event.name === "char" && event.ctrl) {
    switch (event.text) {
      case "a":
        return { kind: "line-start" };
      case "e":
        return { kind: "line-end" };
      case "w":
        return { kind: "delete-word-back" };
      case "u":
        return { kind: "kill-line-back" };
      case "b":
        return { kind: "left" };
      case "f":
        return { kind: "right" };
      case "d":
        return { kind: "delete" };
      case "h":
        return { kind: "backspace" };
    }
    return null;
  }
  if (event.name === "char" && event.meta) {
    if (event.text === "b") return { kind: "word-left" };
    if (event.text === "f") return { kind: "word-right" };
    if (event.text === "d") return { kind: "delete-word-forward" };
    return null;
  }
  switch (event.name) {
    case "backspace":
      return event.meta || event.ctrl ? { kind: "delete-word-back" } : { kind: "backspace" };
    case "delete":
      return event.meta || event.ctrl ? { kind: "delete-word-forward" } : { kind: "delete" };
    case "left":
      return event.ctrl || event.meta ? { kind: "word-left" } : { kind: "left" };
    case "right":
      return event.ctrl || event.meta ? { kind: "word-right" } : { kind: "right" };
    case "home":
      return { kind: "line-start" };
    case "end":
      return { kind: "line-end" };
    case "up":
      return { kind: "up", history };
    case "down":
      return { kind: "down", history };
    default:
      return null;
  }
}

/** Messages and cards are set apart from the row above by a blank line. */
function opensWithBlank(index: number, kind: RowKind): boolean {
  return index > 0 && (kind === "user" || kind === "agent" || kind === "card");
}
