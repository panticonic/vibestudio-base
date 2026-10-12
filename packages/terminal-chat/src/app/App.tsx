/**
 * The terminal chat screen. It subscribes to the chat core's stores, routes
 * input, and lays the screen out as lines (see `screen.ts`); Ink draws them
 * and places the real cursor in the composer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useCursor } from "ink";
import type { ChatMessage } from "@workspace/agentic-core";
import { deriveActiveOutbox } from "@workspace/agentic-core/chat-presentation";
import { ChildTranscriptStore, type ChildTranscriptSnapshot } from "@workspace/agentic-core/chat-store";
import { isModelUsable } from "@workspace/model-catalog/catalog";
import type { AttachmentInput } from "@workspace/pubsub";
import { applyEdit, completeMention, editorFor, emptyEditor, mentionAt, type EditCommand, type EditorState } from "../model/composer.js";
import { completeCommand, parseInput, type Completion } from "../model/commands.js";
import { agentsIn, busyAgentIds, mentionCandidates, mentionIds, parseAgentSettings, type AgentSettings } from "../model/agents.js";
import { createForm, formReduce, type FormState } from "../model/forms.js";
import { resolveBinding, type Mode } from "../model/keymap.js";
import type { InputEvent, KeyEvent } from "../model/keys.js";
import { movePicker, pickerVisibleItems, type PickerItem, type PickerState, type QueueItem } from "../model/overlays.js";
import { isExpandable, messageActions, renderRow, rowKind, type RowContext } from "../model/transcript.js";
import { FOLLOW, computeWindow, revealRow, rowSource, scrollBy, type ScrollState } from "../model/viewport.js";
import type { ChatRuntime } from "../runtime/chatRuntime.js";
import { attentionSequence, copySequence, hyperlink, titleSequence } from "../terminal/escapes.js";
import { useInputEvents, useStore, useTerminalSize, type InputSource } from "../ui/hooks.js";
import { ChatActions, type PromptSpec } from "./actions.js";
import { layoutScreen, type ScreenModel } from "./screen.js";

export interface TerminalChatProps {
  runtime: ChatRuntime;
  input: InputSource;
  /** Writes control sequences (title, attention, clipboard) to the terminal. */
  control: (sequence: string) => void;
  /** How the terminal opens its approvals overlay, as shown in approval cards. */
  approvalsKey?: string;
}

type Overlay =
  | { kind: "picker"; picker: PickerState; onPick: (item: PickerItem) => void }
  | { kind: "prompt"; prompt: PromptSpec; editor: EditorState }
  | { kind: "help"; scroll: number }
  | { kind: "queue"; index: number };

interface PendingAttachment extends AttachmentInput {
  name: string;
}

const EMPTY_SESSION = null;
const IDLE_DEFERRED = { deferredAgent: undefined };

export function TerminalChatApp({ runtime, input, control, approvalsKey = "Ctrl-Space a" }: TerminalChatProps) {
  const size = useTerminalSize();
  const rt = useStore(runtime, runtime.getSnapshot());
  const session = rt.session;
  const chat = useStore(session, EMPTY_SESSION);
  const deferred = useStore(session?.deferredAgent, IDLE_DEFERRED).deferredAgent;
  const forks = useStore(session?.forks, null);
  const signIn = useStore(runtime.signIn, runtime.signIn.getSnapshot());
  const { setCursorPosition } = useCursor();

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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [focused, setFocused] = useState(true);
  const [form, setForm] = useState<{ id: string; state: FormState } | null>(null);
  const [settings, setSettings] = useState<{ agentId: string; settings: AgentSettings } | null>(null);
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
    setAttachments([]);
    setSettings(null);
  }, [rt.generation]);

  // The composer's text is the store's draft; the editor keeps the cursor.
  const draft = chat?.input ?? "";
  useEffect(() => setEditor((current) => editorFor(draft, current)), [draft]);
  const setDraft = (next: EditorState) => {
    setEditor(next);
    session?.setInput(next.text);
  };

  const actions = useMemo(
    () =>
      new ChatActions(runtime, {
        openPicker: (picker, onPick) =>
          setOverlay({ kind: "picker", picker: { query: "", index: picker.index ?? 0, filterable: picker.filterable ?? false, ...picker }, onPick }),
        openPrompt: (prompt) => setOverlay({ kind: "prompt", prompt, editor: editorFor(prompt.initial) }),
        openHelp: () => setOverlay({ kind: "help", scroll: 0 }),
        openQueue: () => setOverlay({ kind: "queue", index: 0 }),
        closeOverlay: () => setOverlay(null),
        setDraft: (text) => {
          setEditor(editorFor(text));
          runtime.getSnapshot().session?.setInput(text);
        },
        addAttachment: (attachment) => setAttachments((list) => [...list, attachment]),
        copy: (text, what) => copy(text, what),
        settingsChanged: () => setSettingsVersion((v) => v + 1),
      }),
    [runtime]
  );

  function copy(text: string, what: string) {
    control(copySequence(text));
    runtime.notify({ tone: "success", title: `Copied ${what}`, message: "Sent to your terminal's clipboard (OSC 52); terminals that block clipboard access ignore it." });
  }

  // ── derived data ───────────────────────────────────────────────────────────
  const selfId = chat?.selfId ?? null;
  const participants = chat?.allParticipants ?? {};
  const agents = useMemo(() => (chat ? agentsIn(chat.participants, chat.selfId) : []), [chat?.participants, chat?.selfId]);
  const outbox = useMemo(() => (chat ? deriveActiveOutbox(chat.messages, chat.selfId, chat.participants) : []), [chat?.messages, chat?.selfId, chat?.participants]);
  const outboxIds = useMemo(() => new Set(outbox.map((m) => m.id)), [outbox]);
  const transcript = useMemo(
    () => (chat?.messages ?? []).filter((m) => !outboxIds.has(m.id) && !(rowKind(m, chat?.selfId ?? null) === "notice" && !m.content && !m.automation && m.contentType !== "inline_ui" && m.contentType !== "custom")),
    [chat?.messages, outboxIds, chat?.selfId]
  );
  const history = useMemo(
    () => (chat?.messages ?? []).filter((m) => m.senderId === selfId && !m.contentType && m.kind !== "system" && m.content.trim()).map((m) => m.content).reverse(),
    [chat?.messages, selfId]
  );
  const busyIds = useMemo(() => busyAgentIds(chat?.messages ?? [], agents), [chat?.messages, agents]);
  const primaryAgent = agents[0] ?? null;

  // Agent settings for the status line: re-read when the agent changes or after we change them.
  useEffect(() => {
    if (!primaryAgent || !chat?.connected) return;
    let cancelled = false;
    runtime
      .callAgent(primaryAgent.id, "getAgentSettings", {})
      .then((raw) => {
        if (!cancelled) setSettings({ agentId: primaryAgent.id, settings: parseAgentSettings(raw) });
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
    else if (form?.id !== pendingForm.id) setForm({ id: pendingForm.id, state: createForm(pendingForm.args) });
  }, [pendingForm?.id]);

  // Child transcripts of expanded subagent cards.
  const children = useRef(new Map<string, { store: ChildTranscriptStore; release: () => void; off: () => void }>());
  const expandedTasks = transcript.filter((m) => m.task?.subagent?.taskChannelId && (expandAll || expanded.has(m.id)));
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
        connection: { config: session.options.config, metadata: session.metadata },
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
  const approvalsPending = transcript.filter((m) => m.approval?.status === "requested").length;
  const attentionKey = `${rt.forms.length}|${approvalsPending}|${transcript.filter((m) => m.contentType === "credential-connect").length}`;
  const lastAttentionKey = useRef(attentionKey);
  useEffect(() => {
    const [forms, approvals, credentials] = attentionKey.split("|").map(Number);
    const [pForms, pApprovals, pCredentials] = lastAttentionKey.current.split("|").map(Number);
    lastAttentionKey.current = attentionKey;
    if (focused) return;
    if (forms! > pForms!) control(attentionSequence("An agent is asking you a question"));
    else if (approvals! > pApprovals!) control(attentionSequence("An agent needs your approval"));
    else if (credentials! > pCredentials!) control(attentionSequence("An agent needs a provider connected"));
  }, [attentionKey, focused]);

  // ── transcript rows ────────────────────────────────────────────────────────
  const gutter = 2;
  const rowCtx: RowContext = { selfId, participants, columns: size.columns - gutter, approvalsKey };
  const isRowExpanded = (msg: ChatMessage) => isExpandable(msg, selfId) && expandAll !== expanded.has(msg.id);
  const childLinesFor = (msg: ChatMessage): string[] | undefined => {
    const entry = children.current.get(msg.id);
    if (!entry) return undefined;
    const snapshot: ChildTranscriptSnapshot = entry.store.getSnapshot();
    if (snapshot.failure || snapshot.error) return [`! ${snapshot.failure?.title ?? snapshot.error}`];
    const ctx: RowContext = { ...rowCtx, columns: rowCtx.columns - 4, selfId: snapshot.selfId, participants: snapshot.participants };
    return snapshot.messages.filter((m) => m.contentType !== "typing").flatMap((m) => renderRow(m, ctx, false));
  };
  void childVersion;
  const source = rowSource(
    transcript,
    (m) => m.id,
    (m, index) => {
      const kind = rowKind(m, selfId);
      const lines = renderRow(m, rowCtx, isRowExpanded(m), m.task && isRowExpanded(m) ? childLinesFor(m) : undefined);
      return index > 0 && (kind === "user" || kind === "agent") ? ["", ...lines] : lines;
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
        models: (catalog?.models ?? []).filter(isModelUsable).map((m) => ({ ref: m.ref, label: m.name, detail: catalog?.providers.find((p) => p.id === m.provider)?.label })),
        providers: catalog?.providers.filter((p) => p.connectable).map((p) => ({ id: p.id, label: p.label })) ?? [],
        thinkingLevels: ["minimal", "low", "medium", "high", "xhigh", "max"],
        respondPolicies: ["all", "mentioned", "mentioned-strict", "mentioned-or-followup"],
        missions: [],
      });
    }
    const mention = mentionAt(editor);
    if (mention) {
      return mentionCandidates(mention.query, participants, selfId).map((c) => ({ insert: c.handle, label: `@${c.handle}`, detail: c.name }));
    }
    return [];
  }, [editor, mode, overlay, menuDismissedFor, rt.host?.modelCatalog, participants, selfId]);
  const menuOpen = completions.length > 0;
  useEffect(() => setMenuIndex(0), [completions.length, editor.text.split(" ")[0]]);

  const viewportRows = useRef(10);
  const page = Math.max(1, viewportRows.current - 2);

  function moveSelection(delta: number) {
    if (transcript.length === 0) return;
    const current = selectedIndex >= 0 ? selectedIndex : transcript.length;
    const next = Math.max(0, Math.min(transcript.length - 1, current + delta));
    setSelectedId(transcript[next]!.id);
    setScroll((s) => revealRow(source, viewportRows.current, s, next));
    if (next === 0 && chat?.hasMoreHistory && !chat.loadingMore) void session?.loadEarlierMessages();
  }

  function scrollPage(delta: number) {
    setScroll((s) => {
      const next = scrollBy(source, viewportRows.current, s, delta);
      if (computeWindow(source, viewportRows.current, next).atTop && chat?.hasMoreHistory && !chat.loadingMore) void session?.loadEarlierMessages();
      return next;
    });
  }

  async function send(afterTurn: boolean) {
    const text = editor.text;
    const parsed = parseInput(text);
    if (parsed.kind === "unknown-command") {
      runtime.notify({ tone: "error", title: `There is no /${parsed.name} command`, message: "Type / to see the commands, or start with // to send a message that begins with a slash." });
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
    const sending = attachments;
    setAttachments([]);
    setScroll(FOLLOW);
    try {
      await session.submit(sending.length ? sending : undefined, {
        mentions: mentionIds(parsed.text, chat?.participants ?? {}, selfId),
        ...(afterTurn ? { metadata: { deliverAfterTurn: true } } : {}),
      });
    } catch (error) {
      setAttachments((current) => [...sending, ...current]);
      runtime.fail("Your message wasn't sent", error, "It is back in the composer. Check the connection and press Enter to try again.");
    }
  }

  function interrupt() {
    if (busyIds.length === 0) {
      runtime.notify({ tone: "info", title: "Nothing to stop", message: "No agent is working right now." });
      return;
    }
    for (const id of busyIds) {
      const agent = agents.find((a) => a.id === id);
      void session?.interruptAgent(id, undefined, agent?.handle ?? undefined).catch((error) => runtime.fail("Couldn't stop the agent", error));
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
      { id: "interrupt", label: "Stop the agent", detail: "Esc", run: interrupt },
      { id: "flush", label: "Send queued messages now and stop the agent", detail: "Esc Esc", run: () => void session?.flushOutboxAndInterrupt() },
      { id: "undo", label: "Undo cancelling queued messages", detail: chat?.undoableAction ? "available" : "nothing to undo", run: () => session?.undoLastAction() },
      { id: "select", label: "Select messages in the transcript", detail: "Ctrl-↑", run: () => enterSelect() },
      { id: "expand", label: expandAll ? "Collapse tool calls and thinking" : "Expand tool calls and thinking", detail: "Ctrl-O", run: () => setExpandAll((v) => !v) },
      { id: "retry-connection", label: "Reconnect the conversation", detail: chat?.connected ? "connected" : "offline", run: () => session?.reconnect("user-retry") },
      { id: "retry-models", label: "Reload models and agents", detail: "", run: () => { runtime.controller?.retryModelSettings(); runtime.controller?.retryAgentCatalog(); runtime.controller?.retryAgentRecovery(); } },
    ];
  }

  function enterSelect() {
    if (transcript.length === 0) return;
    setMode("select");
    const index = transcript.length - 1;
    setSelectedId(transcript[index]!.id);
    setScroll((s) => revealRow(source, viewportRows.current, s, index));
  }

  function handleComposeKey(event: KeyEvent) {
    if (menuOpen) {
      if (event.name === "up") return setMenuIndex((i) => Math.max(0, i - 1));
      if (event.name === "down") return setMenuIndex((i) => Math.min(completions.length - 1, i + 1));
      if (event.name === "escape") return setMenuDismissedFor(editor.text);
      if (event.name === "tab" || (event.name === "enter" && !event.meta && !event.shift)) {
        const item = completions[Math.min(menuIndex, completions.length - 1)]!;
        if (editor.text.startsWith("/")) {
          if (event.name === "enter" && item.runs) {
            const parsed = parseInput(item.insert.trim());
            setDraft(emptyEditor);
            if (parsed.kind === "command") actions.run(parsed.command.name, parsed.args);
            return;
          }
          setDraft(editorFor(item.insert));
        } else {
          setDraft(completeMention(editor, item.insert));
        }
        return;
      }
    }
    const action = resolveBinding("compose", event);
    if (action !== "interrupt") setEscArmed(false);
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
        if (editor.text) setDraft(emptyEditor);
        else interrupt();
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
    const unavailable = (what: string) => runtime.notify({ tone: "info", title: `Can't ${what} on this message`, message: hintFor(msg) });
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
        return available.has("schedule-resume") ? actions.scheduleResume(msg) : unavailable("schedule a resume");
      case "connect":
        return available.has("connect") ? actions.connectFor(msg) : unavailable("connect");
      case "copy":
        return msg.content ? copy(msg.content, "the message") : unavailable("copy");
    }
  }

  function handleOverlayKey(current: Overlay, event: InputEvent) {
    if (event.type === "focus") return;
    if (current.kind === "picker") {
      const picker = current.picker;
      if (event.type === "paste") {
        if (picker.filterable) setOverlay({ ...current, picker: { ...picker, query: picker.query + event.text.replace(/\s+/g, " "), index: 0 } });
        return;
      }
      if (event.name === "escape") return setOverlay(null);
      if (event.name === "up") return setOverlay({ ...current, picker: movePicker(picker, -1) });
      if (event.name === "down") return setOverlay({ ...current, picker: movePicker(picker, 1) });
      if (event.name === "pageup") return setOverlay({ ...current, picker: movePicker(picker, -10) });
      if (event.name === "pagedown") return setOverlay({ ...current, picker: movePicker(picker, 10) });
      if (event.name === "enter") {
        const item = pickerVisibleItems(picker)[picker.index];
        if (!item) return;
        setOverlay(null);
        current.onPick(item);
        return;
      }
      if (picker.filterable && event.name === "backspace") return setOverlay({ ...current, picker: { ...picker, query: picker.query.slice(0, -1), index: 0 } });
      if (picker.filterable && event.name === "char" && !event.ctrl && !event.meta) return setOverlay({ ...current, picker: { ...picker, query: picker.query + event.text, index: 0 } });
      return;
    }
    if (current.kind === "prompt") {
      if (event.type === "key" && event.name === "escape") return setOverlay(null);
      if (event.type === "key" && event.name === "enter" && !(current.prompt.multiline && (event.meta || event.shift))) {
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
      if (event.name === "escape" || event.text === "q" || event.name === "f1") return setOverlay(null);
      const delta = event.name === "up" ? -1 : event.name === "down" ? 1 : event.name === "pageup" ? -10 : event.name === "pagedown" ? 10 : 0;
      setOverlay({ kind: "help", scroll: Math.max(0, current.scroll + delta) });
      return;
    }
    if (current.kind === "queue") {
      const items = queueItems();
      const item = items[current.index];
      if (event.name === "escape" || event.text === "q") return setOverlay(null);
      if (event.name === "up") return setOverlay({ kind: "queue", index: Math.max(0, current.index - 1) });
      if (event.name === "down") return setOverlay({ kind: "queue", index: Math.min(items.length - 1, current.index + 1) });
      if (event.text === "u") return session?.undoLastAction();
      if (!item) return;
      if (event.text === "d") {
        if (deferred?.queued.some((q) => q.id === item.id)) deferred.discardQueued(item.id);
        else void session?.cancelPendingMessage(item.id).catch((error) => runtime.fail("Couldn't discard the message", error));
        return;
      }
      if (event.text === "r" && item.failed) return deferred?.retryDelivery(item.id);
      if (event.text === "e" && !deferred?.queued.some((q) => q.id === item.id)) {
        setOverlay({
          kind: "prompt",
          editor: editorFor(item.text),
          prompt: {
            title: "Edit the queued message",
            initial: item.text,
            multiline: true,
            onSubmit: (text) => session?.editPendingMessage(item.id, text).catch((error) => runtime.fail("Couldn't edit the message", error, "The agent may have read it already.")),
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
        state: q.status === "failed" ? `failed: ${q.failure?.title ?? deferred?.deliveryError ?? "not delivered"}` : q.status === "delivering" ? "sending" : q.status === "waiting" ? "waiting behind a failed message" : "waiting for the first agent",
      });
    }
    for (const m of outbox) {
      items.push({ id: m.id, text: m.content, failed: false, state: chat?.afterTurnMessageIds.has(m.id) ? "sends after the agent's turn" : "queued for the agent" });
    }
    return items;
  }

  useInputEvents(input, (event) => {
    if (event.type === "focus") {
      setFocused(event.focused);
      return;
    }
    // A pending agent question takes the keyboard.
    if (form && pendingForm) {
      const next = formReduce(form.state, pendingForm.args, event);
      setForm({ id: form.id, state: next.state });
      if (next.result) pendingForm.answer(next.result);
      return;
    }
    if (signIn.phase !== "idle") {
      if (signIn.phase === "done" || signIn.phase === "error") {
        runtime.signIn.dismiss();
        return;
      }
      if (event.type === "paste" && signIn.phase === "waiting") return void runtime.signIn.paste(event.text);
      if (event.type === "key" && event.name === "escape") return runtime.signIn.cancel();
      if (event.type === "key" && event.text === "y" && signIn.phase === "waiting") return copy(signIn.url, "the sign-in link");
      return;
    }
    if (overlay) return handleOverlayKey(overlay, event);
    if (event.type === "paste") {
      if (mode === "select") setMode("compose");
      setMenuDismissedFor(null);
      setDraft(applyEdit(editor, { kind: "insert", text: event.text }));
      return;
    }
    if (rt.notices.length > 0 && event.name === "escape" && mode === "compose" && !menuOpen && busyIds.length === 0 && !escArmed) {
      runtime.dismissNotice();
      return;
    }
    if (mode === "select") handleSelectKey(event);
    else handleComposeKey(event);
  });

  // Window title follows the conversation title.
  useEffect(() => {
    control(titleSequence(chat?.channelTitle ? `${chat.channelTitle} — Chat` : "Chat"));
  }, [chat?.channelTitle]);

  // ── screen ─────────────────────────────────────────────────────────────────
  const host = rt.host;
  const model: ScreenModel = {
    size,
    transcript: { source, scroll, selectedIndex: mode === "select" ? selectedIndex : -1, loadingOlder: !!chat?.loadingMore, hasMore: !!chat?.hasMoreHistory, historyError: chat?.historyError ?? null },
    empty: transcript.length === 0 ? emptyState() : null,
    overlay: overlay ? { overlay, queue: overlay.kind === "queue" ? queueItems() : [], undo: chat?.undoableAction ? "u undoes the last discard" : null } : null,
    form: form && pendingForm ? { state: form.state, args: pendingForm.args } : null,
    signIn,
    notices: rt.notices,
    banners: banners(),
    outbox: queueItems(),
    menu: menuOpen ? { items: completions, index: Math.min(menuIndex, completions.length - 1) } : null,
    composer: { editor, attachments: attachments.map((a) => a.name), placeholder: placeholder(), mode, selectedHint: selectedMessage ? hintFor(selectedMessage) : null },
    status: {
      connection: rt.connection,
      joined: !!chat?.connected,
      model: primaryAgent?.activeModel ?? modelNameFor(settings?.settings.model ?? deferred?.draft.model ?? null),
      thinkingLevel: settings?.settings.thinkingLevel ?? deferred?.draft.thinkingLevel ?? null,
      fastMode: settings?.settings.fastMode ?? null,
      contextPercent: primaryAgent?.contextPercent ?? null,
      approvalLevel,
      agentCount: agents.length,
      busy,
      unreadForks: forks ? [...forks.children, ...forks.siblings].filter((f) => f.unread).length : 0,
      queued: outbox.length + (deferred?.queued.length ?? 0),
      title: chat?.channelTitle ?? null,
    },
    approvalsKey,
    linkify: hyperlink,
  };
  const screen = layoutScreen(model);
  viewportRows.current = screen.transcriptRows;

  useEffect(() => {
    setCursorPosition(screen.cursor ?? undefined);
  });

  function modelNameFor(ref: string | null): string | null {
    if (!ref) return null;
    return host?.modelCatalog?.models.find((m) => m.ref === ref)?.name ?? ref;
  }

  function placeholder(): string {
    if (!chat?.connected) return "Connecting…";
    if (agents.length === 0) return "Write your first message — an agent starts when you send it";
    if (busy) return "The agent is working — Enter steers it, Ctrl-S sends after its turn, Esc stops it";
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
      return { title: "Choose a model to start", lines: ["There is no default model in this workspace yet. /model picks one;", "/connect adds a provider account."] };
    }
    return {
      title: chat?.replaySettled === false ? "Loading the conversation…" : "New conversation",
      lines: [
        "Ask anything. Tips:",
        "  /         commands (models, forks, automations, export…)",
        "  @name     address one agent       Ctrl-K   command palette",
        "  Ctrl-↑    select earlier messages  F1       all keys",
        `  Approvals open in the terminal browser: ${approvalsKey}`,
      ],
    };
  }

  function banners(): ScreenModel["banners"] {
    const out: ScreenModel["banners"] = [];
    const error = chat?.connectionError;
    if (error) out.push({ tone: "error", title: error.title, message: `${error.message}${error.retryable ? " Ctrl-K → Reconnect, or wait: it retries by itself." : ""}` });
    if (host?.modelSettingsError) out.push({ tone: "error", title: host.modelSettingsError.title, message: host.modelSettingsError.message });
    if (host?.agentCatalogError) out.push({ tone: "warning", title: host.agentCatalogError.title, message: host.agentCatalogError.message });
    if (host?.recovery.status === "recovering") out.push({ tone: "info", title: "Bringing your agents back…", message: "They rejoin the conversation in a moment." });
    if (host?.recovery.status === "failed" && host.recovery.error) out.push({ tone: "error", title: host.recovery.error.title, message: `${host.recovery.error.message} Ctrl-K → Reload models and agents.` });
    if (deferred?.launchStage && deferred.launchStage !== "ready") {
      const label = deferred.launchStage === "failed" ? deferred.launchError?.title ?? "Your agent couldn't start" : stageLabel(deferred.launchStage);
      out.push({ tone: deferred.launchStage === "failed" ? "error" : "info", title: label, message: deferred.launchStage === "failed" ? `${deferred.launchError?.message ?? ""} /retry tries again.` : "" });
    }
    if (deferred?.setupRequired) out.push({ tone: "warning", title: deferred.setupRequired.title, message: `${deferred.setupRequired.message} /model chooses a model; /connect adds a provider.` });
    else if (deferred?.modelSelectionRequired && deferred.queued.length > 0) out.push({ tone: "warning", title: "Choose a model for your agent", message: "Your message is waiting. /model picks one." });
    if (forks?.error) out.push({ tone: "error", title: "Fork failed", message: forks.error });
    if (chat?.flushNarration) out.push({ tone: "info", title: chat.flushNarration.text, message: "" });
    if (chat?.undoableAction) out.push({ tone: "info", title: "Queued message cancelled", message: "Ctrl-K → Undo brings it back." });
    return out;
  }

  return (
    <Box flexDirection="column" width={size.columns}>
      {screen.lines.map((line, index) => (
        <Text key={index} wrap="truncate-end">
          {line}
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
  return actions.length ? actions.map((a) => `${a.key} ${a.label}`).join(" · ") : "Nothing to do on this message";
}

/** Editing keys of the composer (and of prompt fields). */
export function editCommandFor(event: KeyEvent, history: readonly string[]): EditCommand | null {
  if (event.name === "char" && !event.ctrl && !event.meta) return { kind: "insert", text: event.text };
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
