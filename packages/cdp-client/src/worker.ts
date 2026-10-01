import { CdpDownload, type BrowserOperation } from "./download";
import type {
  BrowserPopup,
  BrowserDownload,
} from "@vibestudio/shared/panel/browserAutomation";
export { CdpDownload } from "./download";
export type { BrowserPopup as CdpPopup } from "@vibestudio/shared/panel/browserAutomation";
// Workerd-native CDP client. Speaks raw Chrome DevTools Protocol
// over a WebSocket (via globalThis.WebSocket), so it runs in a Cloudflare
// Worker / Durable Object isolate AND in panels. Exposes a Playwright-shaped
// `Page`/`Locator` surface implemented entirely over the Runtime/DOM/Input/Page
// CDP domains — no Node deps, no vendored browser bundle.
//
// Portable uploads, network observation and native frame sessions share this
// surface. Hosted downloads/popups use the owning panel lifecycle. Full network
// interception (route) remains outside the page API; raw CDP is available.

import { webSocketAuthProtocol } from "@vibestudio/rpc/protocol/webSocketAuthProtocol";
import { FrameRegistry } from "./frames";
import type { FrameTransport } from "./frames";
import { NetworkObserver } from "./network";
import type {
  CdpNetworkEvent,
  CdpNetworkEvents,
  CdpResponseMatcher,
} from "./network";
export { CdpRequest, CdpResponse } from "./network";
export type {
  CdpNetworkFailure,
  CdpNetworkEvent,
  CdpNetworkEvents,
  CdpResponseMatcher,
} from "./network";

import { runCdpProfile } from "./profile";
import type { CdpProfileOptions, CdpProfileReport } from "./profile";

export type {
  CdpProfileCoverage,
  CdpProfileCoverageScript,
  CdpProfileNetworkMetrics,
  CdpProfileNetworkRequest,
  CdpProfileOptions,
  CdpProfilePageMetrics,
  CdpProfileReport,
  CdpProfileRuntimeMetrics,
} from "./profile";

type CdpResponse = {
  sessionId?: string;
  id?: number;
  result?: unknown;
  error?: { message?: string; data?: string };
};

type PendingCommand = {
  sessionId?: string;
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type CdpEvent = {
  sessionId?: string;
  method: string;
  params?: unknown;
};

export type CdpConsoleEvent = {
  type: string;
  text: string;
  args: unknown[];
};

export type CdpDomInspection = {
  selector: string;
  found: boolean;
  tagName?: string;
  id?: string;
  className?: string;
  text?: string;
  role?: string;
  accessibleName?: string;
  visible?: boolean;
  attributes?: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
  /** Nearest rendered ancestors first, for disambiguating repeated controls. */
  ancestors?: Array<{
    tagName: string;
    role: string;
    accessibleName: string;
    text: string;
  }>;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CdpViewportSize = { width: number; height: number };
export type CdpScreenshotOptions = {
  type?: "png" | "jpeg";
  quality?: number;
  fullPage?: boolean;
};

/** How a locator finds its element(s). Chains resolve left-to-right. */
type TextMatcher = string | RegExp;
type SerializedTextMatcher =
  | string
  | { regex: { source: string; flags: string } };

type LocatorStep =
  | { by: "css"; value: string }
  | { by: "role"; value: string; name?: SerializedTextMatcher; exact?: boolean }
  | { by: "text"; value: SerializedTextMatcher; exact?: boolean }
  | { by: "label"; value: SerializedTextMatcher; exact?: boolean }
  | { by: "placeholder"; value: SerializedTextMatcher; exact?: boolean }
  | { by: "testid"; value: string }
  | { by: "alt"; value: SerializedTextMatcher; exact?: boolean }
  | { by: "title"; value: SerializedTextMatcher; exact?: boolean }
  | { filter: { hasText?: SerializedTextMatcher; hasTextExact?: boolean } }
  | { nth: number };

type LocatorDescriptor = { steps: LocatorStep[] };

type ByTextOptions = { exact?: boolean };
type ByRoleOptions = { name?: TextMatcher; exact?: boolean };
type ActionOptions = { timeout?: number };
/** Portable file payload. Paths on the caller's host are never inferred. */
export type CdpFilePayload = {
  name: string;
  mimeType?: string;
  buffer: Uint8Array;
};
type SelectOptionMatcher = {
  value?: string;
  label?: string;
  index?: number;
};
type SelectOptionInput = string | SelectOptionMatcher;
type WaitState =
  | "attached"
  | "detached"
  | "visible"
  | "hidden"
  | "checked"
  | "unchecked";
type InteractionOptions = ActionOptions & {
  /** Optional semantic postcondition observed after the browser event is delivered. */
  expect?: {
    locator: WorkerCdpLocator;
    state?: WaitState;
    timeout?: number;
  };
};

export interface CdpInteractionOutcome {
  protocol: "cdp-interaction-outcome.v1";
  action:
    | "click"
    | "dblclick"
    | "fill"
    | "clear"
    | "selectOption"
    | "setInputFiles"
    | "focus"
    | "blur"
    | "selectText"
    | "scrollIntoView"
    | "dispatchEvent"
    | "press"
    | "hover"
    | "check"
    | "uncheck";
  delivery: "dispatched" | "not-needed";
  target: CdpDomInspection;
  effect:
    | { status: "not-asserted" }
    | {
        status: "observed" | "not-observed";
        locator: string;
        state: WaitState;
      };
}
type Keyboard = {
  down(key: string): Promise<void>;
  up(key: string): Promise<void>;
  press(key: string): Promise<void>;
  type(text: string): Promise<void>;
  insertText(text: string): Promise<void>;
};

/**
 * Compile the public locator selector dialect into the one descriptor model
 * used by every locator engine. CSS is the default; Playwright's common
 * `text=<JSON string>` form is semantic text matching, not a string forwarded
 * to querySelectorAll.
 */
function compileLocatorSelector(selector: string): LocatorStep {
  if (!selector.startsWith("text=")) return { by: "css", value: selector };

  const source = selector.slice("text=".length).trim();
  if (!source.startsWith('"')) {
    return { by: "text", value: source, exact: false };
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    const error = new TypeError(
      `Invalid text locator ${JSON.stringify(
        selector,
      )}: quoted text must be a valid JSON string, for example locator('text="Save changes"').`,
    );
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }
  if (typeof value !== "string") {
    throw new TypeError(
      `Invalid text locator ${JSON.stringify(
        selector,
      )}: text= must be followed by text or a quoted JSON string.`,
    );
  }
  return { by: "text", value, exact: true };
}

type WebSocketCtor = new (
  url: string,
  protocols?: string | string[],
) => WebSocket;

type WorkerClientWebSocket = WebSocket & { accept?: () => void };

function runsInFetchUpgradeWorker(): boolean {
  // workerd exposes both WebSocket and WebSocketPair. The former is the
  // server-side WebSocket surface and does not reliably route an outbound
  // connection through Vibestudio's egress boundary. Fetch upgrades carry the
  // internal grant through the boundary explicitly, so prefer that transport
  // whenever the worker runtime is identifiable.
  return (
    typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair ===
    "function"
  );
}

async function openWebSocket(
  wsEndpoint: string,
  authToken?: string,
  preferFetchUpgrade = false,
  signal?: AbortSignal,
): Promise<{ socket: WorkerClientWebSocket; waitForOpen: boolean }> {
  const ctor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (ctor && !preferFetchUpgrade && !runsInFetchUpgradeWorker()) {
    return {
      socket: new ctor(
        wsEndpoint,
        authToken
          ? [webSocketAuthProtocol("inspection", authToken)]
          : undefined,
      ),
      waitForOpen: true,
    };
  }

  if (typeof fetch !== "function") {
    throw new Error(
      "CDP WebSocket transport is unavailable: this runtime exposes neither WebSocket nor fetch",
    );
  }

  const upgradeUrl = new URL(wsEndpoint);
  if (upgradeUrl.protocol === "ws:") upgradeUrl.protocol = "http:";
  else if (upgradeUrl.protocol === "wss:") upgradeUrl.protocol = "https:";
  else {
    throw new Error(
      `CDP endpoint must use ws: or wss:, received ${upgradeUrl.protocol}`,
    );
  }
  if (authToken) {
    const headerPairs = JSON.stringify([["x-vibestudio-cdp-grant", authToken]]);
    const encoded = btoa(headerPairs)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    // Workerd's outbound WebSocket proxy cannot carry arbitrary upgrade
    // headers directly. This transport metadata is decoded by the egress
    // boundary, verified there, and removed before the upstream handshake.
    upgradeUrl.searchParams.set("__vibestudio_ws_headers", encoded);
  }

  const response = (await fetch(upgradeUrl, {
    headers: { Upgrade: "websocket" },
    signal,
  })) as Response & { webSocket?: WorkerClientWebSocket | null };
  const socket = response.webSocket;
  if (!socket)
    throw new Error(
      `CDP WebSocket upgrade failed with HTTP ${response.status}: response contained no WebSocket`,
    );
  socket.accept?.();
  return { socket, waitForOpen: false };
}

function once(
  ws: WebSocket,
  event: "open" | "message" | "error" | "close",
  signal?: AbortSignal,
): Promise<Event | MessageEvent> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      ws.removeEventListener(event, handle);
      ws.removeEventListener("error", handleError);
      ws.removeEventListener("close", handleClose);
    };
    const handle = (ev: Event | MessageEvent) => {
      cleanup();
      resolve(ev);
    };
    const handleError = () => {
      cleanup();
      reject(
        signal?.aborted
          ? signal.reason
          : new Error(`CDP WebSocket ${event} failed`),
      );
    };
    const handleClose = () => {
      cleanup();
      reject(
        signal?.aborted
          ? signal.reason
          : new Error(`CDP WebSocket closed before ${event}`),
      );
    };
    const handleAbort = () => {
      ws.close();
    };
    ws.addEventListener(event, handle);
    if (event !== "error") ws.addEventListener("error", handleError);
    if (event !== "close") ws.addEventListener("close", handleClose);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });
}

async function messageText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  if (data && typeof (data as Blob).text === "function") {
    return (data as Blob).text();
  }
  return String(data);
}

function decodeBase64(data: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const bufferCtor = (
    globalThis as { Buffer?: { from(data: string, enc: string): Uint8Array } }
  ).Buffer;
  if (bufferCtor) return bufferCtor.from(data, "base64");
  throw new Error("No base64 decoder is available in this runtime");
}

export interface CdpDialogData {
  type: "alert" | "confirm" | "prompt" | "beforeunload";
  message: string;
  defaultPrompt: string;
  url: string;
}

export class CdpDialog {
  constructor(
    readonly data: Readonly<CdpDialogData>,
    private readonly respond: (
      accept: boolean,
      promptText?: string,
    ) => Promise<void>,
  ) {}
  type(): CdpDialogData["type"] {
    return this.data.type;
  }
  message(): string {
    return this.data.message;
  }
  defaultValue(): string {
    return this.data.defaultPrompt;
  }
  accept(promptText?: string): Promise<void> {
    return this.respond(true, promptText);
  }
  dismiss(): Promise<void> {
    return this.respond(false);
  }
}

type DialogHandler = (dialog: CdpDialog) => void | Promise<void>;
function dialogBlocksCommand(method: string): boolean {
  return (
    method.startsWith("Input.") ||
    method === "Runtime.evaluate" ||
    method === "Runtime.callFunctionOn" ||
    method === "Page.navigate" ||
    method === "Page.reload" ||
    method === "Page.navigateToHistoryEntry"
  );
}

export class CdpConnection {
  private nextId = 1;
  private readonly sessions = new Map<string, CdpSession>();
  private pending = new Map<number, PendingCommand>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();
  private closed = false;
  private readonly disconnectListeners = new Set<(error: Error) => void>();
  private closeError: Error | null = null;
  private activeDialog: {
    dialog: CdpDialog;
    response: Promise<void> | null;
  } | null = null;
  private readonly dialogHandlers = new Set<DialogHandler>();

  dialog(): CdpDialog | null {
    return this.activeDialog?.dialog ?? null;
  }
  onDialog(handler: DialogHandler): () => void {
    this.dialogHandlers.add(handler);
    return () => {
      this.dialogHandlers.delete(handler);
    };
  }

  private dialogError(
    method: string,
    dialog: CdpDialog,
    cause?: unknown,
  ): CdpError {
    return new CdpError(
      `Browser ${dialog.type()} dialog requires a response: ${dialog.message()}`,
      {
        code: "cdp_dialog_open",
        operation: method,
        recovery: "handle-dialog-and-observe",
        dialog: dialog.data,
        cause,
        instruction:
          "Use page.dialog() to inspect and accept or dismiss the pending dialog, then observe the effect without repeating the input or evaluation. Register page.on('dialog', handler) before actions that intentionally open dialogs.",
      },
    );
  }

  private rejectDialogBlockedCommands(
    dialog: CdpDialog,
    cause?: unknown,
  ): void {
    for (const [id, command] of this.pending) {
      if (!dialogBlocksCommand(command.method)) continue;
      this.pending.delete(id);
      command.reject(this.dialogError(command.method, dialog, cause));
    }
  }

  private async receiveDialog(data: CdpDialogData): Promise<void> {
    const state: { dialog: CdpDialog; response: Promise<void> | null } = {
      response: null,
      dialog: new CdpDialog(
        Object.freeze({ ...data, defaultPrompt: data.defaultPrompt ?? "" }),
        (accept, promptText) => {
          if (this.activeDialog !== state || state.response)
            return Promise.reject(
              new CdpError(
                "This browser dialog has already been answered, closed or replaced",
                {
                  code: "cdp_dialog_closed",
                  operation: "Page.handleJavaScriptDialog",
                  recovery: "handle-dialog-and-observe",
                },
              ),
            );
          // The native response belongs to the dialog, even when an event handler
          // initiates accept/dismiss without returning its promise.
          state.response = this.send("Page.handleJavaScriptDialog", {
            accept,
            ...(promptText === undefined ? {} : { promptText }),
          }).then(() => {
            if (this.activeDialog === state) this.activeDialog = null;
          });
          return state.response;
        },
      ),
    };
    this.activeDialog = state;
    try {
      await Promise.all(
        [...this.dialogHandlers].map((handler) => handler(state.dialog)),
      );
      await state.response;
      if (this.activeDialog === state)
        this.rejectDialogBlockedCommands(state.dialog);
    } catch (error) {
      if (this.activeDialog === state)
        this.rejectDialogBlockedCommands(state.dialog, error);
    }
  }

  private constructor(
    private readonly ws: WebSocket,
    private readonly operationSignal?: () => AbortSignal | undefined,
  ) {
    ws.addEventListener("message", (event) => {
      void this.handleMessage((event as MessageEvent).data);
    });
    ws.addEventListener("error", () => {
      this.disconnect(
        new CdpError(
          "CDP target connection failed. Inspect the panel diagnostics and acquire a new page if the target still exists.",
          {
            code: "cdp_target_connection_failed",
            operation: "connect",
            failureKind: "infrastructure",
            recovery: "inspect-panel-and-reacquire-page",
          },
        ),
      );
    });
    ws.addEventListener("close", () => {
      this.disconnect(
        new CdpError(
          "CDP target connection closed. The panel may have been closed, or its runtime may have been replaced by handle.navigate() or handle.rebuild(). If the panel still exists, obtain a fresh page with await handle.cdp.page(); do not reuse the cached page.",
          {
            code: "cdp_target_closed",
            operation: "connection",
            failureKind: "infrastructure",
            recovery: "reacquire-page",
          },
        ),
      );
    });
  }

  static async connect(
    wsEndpoint: string,
    authToken?: string,
    preferFetchUpgrade = false,
    options: {
      signal?: AbortSignal;
      operationSignal?: () => AbortSignal | undefined;
    } = {},
  ): Promise<CdpConnection> {
    options.signal?.throwIfAborted();
    const { socket: ws, waitForOpen } = await openWebSocket(
      wsEndpoint,
      authToken,
      preferFetchUpgrade,
      options.signal,
    );
    if (waitForOpen) await once(ws, "open", options.signal);
    else if (options.signal?.aborted) {
      ws.close();
      options.signal.throwIfAborted();
    }
    return new CdpConnection(ws, options.operationSignal);
  }

  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown> {
    if (this.closed) {
      if (this.closeError instanceof CdpError) {
        return Promise.reject(
          new CdpError(`Cannot send ${method}: ${this.closeError.message}`, {
            ...this.closeError.errorData,
            cause: this.closeError,
            operation: method,
          }),
        );
      }
      const reason =
        this.closeError?.message ??
        "CDP connection is closed. Obtain a fresh page before sending more commands.";
      return Promise.reject(
        new CdpError(`Cannot send ${method}: ${reason}`, {
          code: "cdp_target_closed",
          operation: method,
          failureKind: "infrastructure",
          recovery: "reacquire-page",
        }),
      );
    }
    if (!sessionId && this.activeDialog && dialogBlocksCommand(method)) {
      if (this.activeDialog.response) {
        // No command has been dispatched yet: join the explicit decision before
        // sending new renderer work. Original pending commands are never replayed.
        return this.activeDialog.response.then(() => this.send(method, params));
      }
      return Promise.reject(this.dialogError(method, this.activeDialog.dialog));
    }
    const id = this.nextId++;
    const message = {
      id,
      method,
      ...(params ? { params } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
    return new Promise((resolve, reject) => {
      let releaseOwner = () => {};
      this.pending.set(id, {
        method,
        sessionId,
        resolve: (value) => {
          releaseOwner();
          resolve(value);
        },
        reject: (error) => {
          releaseOwner();
          reject(error);
        },
      });
      releaseOwner = this.bindOperationCancellation();
      if (this.closed) return;
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.pending.delete(id);
        releaseOwner();
        reject(error);
      }
    });
  }

  close(): void {
    if (this.closed) return;
    this.disconnect(
      new CdpError(
        "CDP connection closed by the client. Create a new connection before sending more commands.",
        {
          code: "cdp_target_closed",
          operation: "close",
          failureKind: "user-code",
          recovery: "reacquire-page",
        },
      ),
    );
    this.ws.close();
  }

  isClosed(): boolean {
    return this.closed;
  }

  private disconnect(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    for (const listener of this.disconnectListeners) listener(error);
    this.disconnectListeners.clear();
    this.eventListeners.clear();
    this.dialogHandlers.clear();
    this.activeDialog = null;
  }

  private bindOperationCancellation(): () => void {
    if (this.closed) return () => {};
    const signal = this.operationSignal?.();
    if (!signal) return () => {};
    const cancel = () => {
      const reason = signal.reason;
      this.disconnect(
        reason instanceof Error
          ? reason
          : new Error("CDP operation cancelled", { cause: reason }),
      );
      this.ws.close();
    };
    if (signal.aborted) {
      cancel();
      return () => {};
    }
    signal.addEventListener("abort", cancel, { once: true });
    return () => signal.removeEventListener("abort", cancel);
  }

  onClosed(listener: (error: Error) => void): () => void {
    if (this.closeError) listener(this.closeError);
    else this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  onDisconnect(listener: (error: Error) => void): () => void {
    const releaseOwner = this.bindOperationCancellation();
    if (this.closeError) {
      releaseOwner();
      listener(this.closeError);
    } else this.disconnectListeners.add(listener);
    return () => {
      releaseOwner();
      this.disconnectListeners.delete(listener);
    };
  }

  session(id: string): CdpSession {
    let session = this.sessions.get(id);
    if (!session) {
      session = new CdpSession(this, id);
      this.sessions.set(id, session);
    }
    return session;
  }
  /** @internal Authoritative child detach settles only commands owned by that child. */
  detachSession(id: string, error: Error): void {
    for (const [commandId, command] of this.pending) {
      if (command.sessionId === id) {
        this.pending.delete(commandId);
        command.reject(error);
      }
    }
    this.sessions.get(id)?.disconnect(error);
  }
  rejectSessionDialogCommands(
    sessionId: string,
    dialog: CdpDialog,
    cause?: unknown,
  ): void {
    for (const [id, command] of this.pending) {
      if (
        command.sessionId !== sessionId ||
        !dialogBlocksCommand(command.method)
      )
        continue;
      this.pending.delete(id);
      command.reject(this.dialogError(command.method, dialog, cause));
    }
  }
  on(
    method: string,
    listener: (params: unknown) => void,
    sessionId?: string,
  ): () => void {
    const key = JSON.stringify([sessionId ?? null, method]);
    const listeners = this.eventListeners.get(key) ?? new Set();
    listeners.add(listener);
    this.eventListeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.eventListeners.delete(key);
    };
  }

  private async handleMessage(data: unknown): Promise<void> {
    let parsed: CdpResponse & CdpEvent;
    try {
      parsed = JSON.parse(await messageText(data)) as CdpResponse & CdpEvent;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        ("id" in parsed
          ? !Number.isSafeInteger(parsed.id) ||
            (!("result" in parsed) && !parsed.error)
          : typeof parsed.method !== "string")
      )
        throw new Error("CDP frame is neither a command response nor an event");
    } catch (err) {
      this.disconnect(
        new CdpError("Invalid CDP protocol frame", {
          code: "cdp_protocol_error",
          operation: "receive",
          failureKind: "infrastructure",
          recovery: "inspect-panel-and-reacquire-page",
          cause: err,
        }),
      );
      this.ws.close();
      return;
    }
    if (this.closed) return;
    if (typeof parsed.id !== "number") {
      if (
        !parsed.sessionId &&
        parsed.method === "Page.javascriptDialogOpening"
      ) {
        void this.receiveDialog(parsed.params as CdpDialogData);
      } else if (
        !parsed.sessionId &&
        parsed.method === "Page.javascriptDialogClosed"
      ) {
        this.activeDialog = null;
      }
      if (
        parsed.method === "Inspector.targetCrashed" ||
        parsed.method === "Inspector.detached"
      ) {
        if (parsed.sessionId) {
          this.detachSession(
            parsed.sessionId,
            new Error(`CDP child target ${parsed.method}`),
          );
          return;
        }
        const crashed = parsed.method === "Inspector.targetCrashed";
        const reason = (parsed.params as { reason?: unknown } | undefined)
          ?.reason;
        this.disconnect(
          new CdpError(
            crashed
              ? "CDP target renderer crashed. Inspect panel diagnostics before acquiring a new page."
              : `CDP inspector detached${typeof reason === "string" ? `: ${reason}` : "."}`,
            {
              code: crashed ? "cdp_target_crashed" : "cdp_target_detached",
              operation: parsed.method,
              failureKind: "infrastructure",
              recovery: "inspect-panel-and-reacquire-page",
            },
          ),
        );
        this.ws.close();
        return;
      }
      if (parsed.method === "Target.detachedFromTarget") {
        const id = (parsed.params as { sessionId?: string }).sessionId;
        if (id) this.detachSession(id, new Error("CDP child target detached"));
      }
      if (parsed.method) {
        for (const listener of this.eventListeners.get(
          JSON.stringify([parsed.sessionId ?? null, parsed.method]),
        ) ?? []) {
          listener(parsed.params);
        }
      }
      return;
    }
    const pending = this.pending.get(parsed.id);
    if (!pending) return;
    if (pending.sessionId !== parsed.sessionId) {
      this.disconnect(
        new Error("CDP response session does not match its command owner"),
      );
      this.ws.close();
      return;
    }
    this.pending.delete(parsed.id);
    if (parsed.error) {
      pending.reject(
        new Error(
          parsed.error.message ?? parsed.error.data ?? "CDP command failed",
        ),
      );
      return;
    }
    pending.resolve(parsed.result);
  }
}

/** A flattened child session shares transport and cancellation ownership with its panel. */
export class CdpSession {
  private error: Error | null = null;
  private readonly closedListeners = new Set<(error: Error) => void>();
  private readonly subscriptions: Array<() => void> = [];
  private activeDialog: {
    dialog: CdpDialog;
    response: Promise<void> | null;
  } | null = null;
  private readonly dialogHandlers = new Set<DialogHandler>();
  constructor(
    private readonly parent: CdpConnection,
    readonly id: string,
  ) {
    this.subscriptions.push(
      parent.onClosed((error) => this.disconnect(error)),
      this.on("Page.javascriptDialogOpening", (raw) => {
        void this.receiveDialog(raw as CdpDialogData);
      }),
      this.on("Page.javascriptDialogClosed", () => {
        this.activeDialog = null;
      }),
    );
  }
  dialog(): CdpDialog | null {
    return this.activeDialog?.dialog ?? null;
  }
  onDialog(handler: DialogHandler): () => void {
    this.dialogHandlers.add(handler);
    return () => this.dialogHandlers.delete(handler);
  }
  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.error) return Promise.reject(this.error);
    if (this.activeDialog?.response && dialogBlocksCommand(method))
      return this.activeDialog.response.then(() => this.send(method, params));
    if (this.activeDialog && dialogBlocksCommand(method))
      return Promise.reject(
        new CdpError("Browser child dialog requires a response", {
          code: "cdp_dialog_open",
          operation: method,
          recovery: "handle-dialog-and-observe",
          dialog: this.activeDialog.dialog.data,
        }),
      );
    return this.parent.send(method, params, this.id);
  }
  on(method: string, listener: (params: unknown) => void): () => void {
    const release = this.parent.on(method, listener, this.id);
    return release;
  }
  onClosed(listener: (error: Error) => void): () => void {
    if (this.error) listener(this.error);
    else this.closedListeners.add(listener);
    return () => this.closedListeners.delete(listener);
  }
  onDisconnect(listener: (error: Error) => void): () => void {
    let settled = false;
    const notify = (error: Error) => {
      if (!settled) {
        settled = true;
        listener(error);
      }
    };
    const releaseParent = this.parent.onDisconnect(notify);
    const releaseChild = this.onClosed(notify);
    return () => {
      releaseParent();
      releaseChild();
    };
  }
  private async receiveDialog(data: CdpDialogData): Promise<void> {
    const state: { dialog: CdpDialog; response: Promise<void> | null } = {
      response: null,
      dialog: new CdpDialog(
        Object.freeze({ ...data, defaultPrompt: data.defaultPrompt ?? "" }),
        (accept, promptText) => {
          if (this.activeDialog !== state || state.response)
            return Promise.reject(
              new CdpError("Browser dialog already answered or closed", {
                code: "cdp_dialog_closed",
                operation: "Page.handleJavaScriptDialog",
                recovery: "handle-dialog-and-observe",
              }),
            );
          state.response = this.send("Page.handleJavaScriptDialog", {
            accept,
            ...(promptText === undefined ? {} : { promptText }),
          }).then(() => {
            if (this.activeDialog === state) this.activeDialog = null;
          });
          return state.response;
        },
      ),
    };
    this.activeDialog = state;
    try {
      await Promise.all(
        [...this.dialogHandlers].map((handler) => handler(state.dialog)),
      );
      await state.response;
      if (this.activeDialog === state)
        this.parent.rejectSessionDialogCommands(this.id, state.dialog);
    } catch (error) {
      if (this.activeDialog === state)
        this.parent.rejectSessionDialogCommands(this.id, state.dialog, error);
    }
  }
  session(id: string): CdpSession {
    return this.parent.session(id);
  }
  isClosed(): boolean {
    return !!this.error || this.parent.isClosed();
  }
  close(): void {
    this.parent.detachSession(
      this.id,
      new Error("CDP child session closed by its owner"),
    );
  }
  disconnect(error: Error): void {
    if (this.error) return;
    this.error = error;
    for (const release of this.subscriptions.splice(0)) release();
    for (const listener of this.closedListeners) listener(error);
    this.closedListeners.clear();
    this.dialogHandlers.clear();
    this.activeDialog = null;
  }
}

type CdpChannel = CdpConnection | CdpSession | FrameChannel;

// ---------------------------------------------------------------------------
// In-page runtime. A single self-contained program injected into the target
// page via Runtime.evaluate. It owns element resolution (CSS + getBy* engines),
// atomic visibility/state probes, and all DOM-side actions/reads. The client
// repeats failed state probes between evaluations so the renderer remains free
// to process queued input and UI work while a locator is waiting. Pointer
// actions (click/hover/...) only observe one candidate hit point here; the
// client compares observations for stability and dispatches mouse/key events
// via CDP Input.
//
// Kept as one literal string (no ${} interpolation) so it is the single source
// of truth and is trivially serialisable. `__nsRun(payload)` is the entrypoint.
// ---------------------------------------------------------------------------
const INPAGE = String.raw`
function nsNorm(s){ return (s==null?"":String(s)).replace(/\s+/g," ").trim(); }
function nsDedupe(a){ return a.filter(function(e,i){ return a.indexOf(e)===i; }); }
function nsRetainedElements(){ var key=Symbol.for("@workspace/cdp-client/retained-elements"); var registry=globalThis[key]; if(!(registry instanceof Map)){ registry=new Map(); globalThis[key]=registry; } return registry; }
function nsRetainedElement(token){ var e=nsRetainedElements().get(token); if(!e) throw new Error("Retained element lease is no longer available"); return e; }
function nsSourceText(el){ return !!el && /^(HEAD|TITLE|SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(el.tagName||""); }
function nsContentText(node){
  if(!node||nsSourceText(node)) return "";
  if(node.nodeType===3) return node.nodeValue||"";
  if(!node.childNodes) return node.textContent!=null?node.textContent:(node.innerText||"");
  var parts=[]; for(var i=0;i<node.childNodes.length;i++) parts.push(nsContentText(node.childNodes[i]));
  return parts.join("");
}
function nsText(el){ if(!el||nsSourceText(el)) return ""; return nsNorm(el.innerText!=null && nsVisible(el) ? el.innerText : nsContentText(el)); }
function nsValueMatch(value, q, exact){ var t=nsNorm(value); if(q&&typeof q==="object"&&q.regex){ return new RegExp(q.regex.source,q.regex.flags).test(t); } var n=nsNorm(q); return exact ? t===n : t.toLowerCase().indexOf(n.toLowerCase())!==-1; }
function nsTextMatch(el, q, exact){ return !nsSourceText(el) && nsValueMatch(nsText(el),q,exact); }
function nsHasTextMatchingDescendant(el,q,exact){ var all=el&&el.querySelectorAll?el.querySelectorAll("*"):[]; for(var i=0;i<all.length;i++){ if(nsTextMatch(all[i],q,exact)) return true; } return false; }
function nsAttr(el, name){ return el && el.getAttribute ? el.getAttribute(name) : null; }
function nsSetNativeProperty(el,name,value){ var proto=Object.getPrototypeOf(el); var descriptor=proto&&Object.getOwnPropertyDescriptor(proto,name); if(descriptor&&descriptor.set) descriptor.set.call(el,value); else el[name]=value; }
function nsDispatchInput(el,value){ var event; try { event=new InputEvent("input",{bubbles:true,inputType:"insertText",data:value==null?null:String(value)}); } catch(e) { event=new Event("input",{bubbles:true}); } el.dispatchEvent(event); el.dispatchEvent(new Event("change",{bubbles:true})); }
function nsRole(el){
  var r = nsAttr(el,"role"); if(r) return r.trim().toLowerCase().split(/\s+/)[0];
  var tag = el.tagName ? el.tagName.toLowerCase() : "";
  if(tag==="a") return el.hasAttribute("href") ? "link" : "";
  if(tag==="button") return "button";
  if(tag==="dialog") return "dialog";
  if(tag==="select") return el.multiple ? "listbox" : "combobox";
  if(tag==="textarea") return "textbox";
  if(/^h[1-6]$/.test(tag)) return "heading";
  if(tag==="img") return "img";
  if(tag==="nav") return "navigation";
  if(tag==="main") return "main";
  if(tag==="ul"||tag==="ol") return "list";
  if(tag==="li") return "listitem";
  if(tag==="table") return "table";
  if(tag==="form") return "form";
  if(tag==="input"){
    var ty=(nsAttr(el,"type")||"text").toLowerCase();
    var m={checkbox:"checkbox",radio:"radio",button:"button",submit:"button",reset:"button",image:"button",range:"slider",number:"spinbutton",search:"searchbox"};
    return m[ty]||"textbox";
  }
  return "";
}
function nsAccName(el){
  var al=nsAttr(el,"aria-label"); if(al) return nsNorm(al);
  var lb=nsAttr(el,"aria-labelledby");
  if(lb){ var parts=lb.split(/\s+/).map(function(id){ var e=document.getElementById(id); return e?nsText(e):""; }); var j=nsNorm(parts.join(" ")); if(j) return j; }
  if(el.tagName==="IMG"){ var alt=nsAttr(el,"alt"); if(alt) return nsNorm(alt); }
  if(el.labels && el.labels.length) return nsNorm(Array.prototype.map.call(el.labels,function(l){return nsLabelText(l);}).join(" "));
  var t=nsText(el); if(t) return t;
  var ph=nsAttr(el,"placeholder"); if(ph) return nsNorm(ph);
  var ti=nsAttr(el,"title"); if(ti) return nsNorm(ti);
  return "";
}
function nsLabelText(label){
  var clone=label.cloneNode(true);
  var controls=clone.querySelectorAll?clone.querySelectorAll("input,textarea,select,button,meter,output,progress"):[];
  for(var i=0;i<controls.length;i++) controls[i].remove();
  return nsText(clone);
}
function nsAssociatedLabelMatches(el,q,exact){
  if(!el.labels) return false;
  for(var i=0;i<el.labels.length;i++) if(nsValueMatch(nsLabelText(el.labels[i]),q,exact)) return true;
  return false;
}
function nsVisible(el){
  if(!el||!el.getBoundingClientRect) return false;
  var s=getComputedStyle(el); var r=el.getBoundingClientRect();
  return s.visibility!=="hidden" && s.display!=="none" && Number(s.opacity||"1")>0 && r.width>0 && r.height>0;
}
function nsEnabled(el){ return !el.disabled && nsAttr(el,"aria-disabled")!=="true"; }
function nsCheckedObservation(el){ if("checked" in el) return !!el.checked; var aria=nsAttr(el,"aria-checked"); if(aria==="true"||aria==="false") return aria==="true"; var data=nsAttr(el,"data-state"); if(data==="checked"||data==="on") return true; if(data==="unchecked"||data==="off") return false; return null; }
function nsCheckedState(el){ var checked=nsCheckedObservation(el); if(checked===null) throw new Error("Element is not checkable"); return checked; }
function nsEditable(el){
  if(el.isContentEditable) return true;
  var tag=el.tagName ? el.tagName.toLowerCase() : "";
  if(tag!=="input" && tag!=="textarea" && tag!=="select") return false;
  return !el.disabled && !el.readOnly;
}
function nsSelectOptionMatch(option, matcher, index){
  if(typeof matcher === "string") return option.value===matcher || option.label===matcher || nsNorm(option.textContent)===matcher;
  if(matcher.value!==undefined && option.value===matcher.value) return true;
  if(matcher.label!==undefined && option.label===matcher.label) return true;
  return matcher.index!==undefined && index===matcher.index;
}
function nsStepFind(roots, step){
  var out=[];
  if(step.by==="css"){
    for(var i=0;i<roots.length;i++){ var found=(roots[i]===document?document:roots[i]).querySelectorAll(step.value); for(var j=0;j<found.length;j++) out.push(found[j]); }
    return nsDedupe(out);
  }
  var pred=function(e){
    switch(step.by){
      case "role": { if(nsRole(e)!==String(step.value).toLowerCase()) return false; if(step.name!=null) return nsValueMatch(nsAccName(e),step.name,step.exact); return true; }
      case "text": return nsTextMatch(e, step.value, step.exact);
      case "label": { return nsAssociatedLabelMatches(e,step.value,step.exact) || ((nsAttr(e,"aria-label")!=null || nsAttr(e,"aria-labelledby")!=null) && nsValueMatch(nsAccName(e),step.value,step.exact)); }
      case "placeholder": { var ph=nsAttr(e,"placeholder"); return ph!=null && nsValueMatch(ph,step.value,step.exact); }
      case "testid": return nsAttr(e,"data-testid")===step.value;
      case "alt": { var a=nsAttr(e,"alt"); return a!=null && nsValueMatch(a,step.value,step.exact); }
      case "title": { var ti=nsAttr(e,"title"); return ti!=null && nsValueMatch(ti,step.value,step.exact); }
      default: return false;
    }
  };
  for(var k=0;k<roots.length;k++){
    var scope=roots[k]===document?document:roots[k];
    var all=scope.querySelectorAll("*");
    for(var m=0;m<all.length;m++){ if(pred(all[m])) out.push(all[m]); }
  }
  if(step.by==="label"){
    var associated=[]; var fallback=[];
    for(var li=0;li<out.length;li++){
      var candidate=out[li];
      if(nsAssociatedLabelMatches(candidate,step.value,step.exact)) associated.push(candidate);
      else fallback.push(candidate);
    }
    out=associated.concat(fallback);
  }
  var unique=nsDedupe(out);
  return step.by==="text" ? unique.filter(function(e){ return !nsHasTextMatchingDescendant(e,step.value,step.exact); }) : unique;
}
function nsLocate(descriptor){
  var cur=[document];
  var steps=descriptor.steps||[];
  for(var i=0;i<steps.length;i++){
    var step=steps[i];
    if(step.filter){ cur=cur.filter(function(e){ return e!==document && (step.filter.hasText==null || nsTextMatch(e, step.filter.hasText, step.filter.hasTextExact)); }); continue; }
    if(step.nth!=null){ var idx=step.nth<0?cur.length+step.nth:step.nth; cur=(idx>=0&&idx<cur.length)?[cur[idx]]:[]; continue; }
    cur=nsStepFind(cur, step);
  }
  return cur;
}
function nsFirst(descriptor){
  var matches=nsLocate(descriptor);
  if(matches.length>1){
    var failure=new Error("Locator matched "+matches.length+" elements");
    failure.__nsLocatorFailure={__nsLocatorFailure:"ambiguous",matchCount:matches.length,candidates:matches.slice(0,8).map(function(e){return {role:nsRole(e),accessibleName:nsAccName(e),tagName:e.tagName};})};
    throw failure;
  }
  return matches.length?matches[0]:null;
}
function nsFirstVisible(descriptor){ var e=nsFirst(descriptor); return e&&nsVisible(e)?e:null; }
function nsBox(el){ var r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; }
function nsSleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
function nsAfterAction(){ return nsSleep(0); }
async function nsWaitForState(descriptor, state, timeout){
  var el=state==="visible"?nsFirstVisible(descriptor):nsFirst(descriptor);
  var ok;
  if(state==="detached") ok=!el;
  else if(state==="attached") ok=!!el;
  else if(state==="hidden") ok=!el||!nsVisible(el);
  else if(state==="checked"||state==="unchecked") ok=!!el&&nsCheckedState(el)===(state==="checked");
  else ok=!!el&&nsVisible(el);
  if(ok) return el;
  var failure=new Error("Timeout "+timeout+"ms waiting for element to be "+state);
  failure.__nsLocatorFailure={__nsLocatorFailure:"state-timeout",state:state,timeout:timeout};
  throw failure;
}
function nsActionable(descriptor, retainToken){
  var el=nsFirst(descriptor);
  if(!el) return {ok:false, reason:"not found"};
  if(!nsVisible(el)) return {ok:false, reason:"not visible"};
  if(!nsEnabled(el)) return {ok:false, reason:"not enabled"};
  try{ el.scrollIntoView({block:"center",inline:"center"}); }catch(e){}
  var b=nsBox(el), x=b.x+b.width/2, y=b.y+b.height/2;
  var hit=document.elementFromPoint(x,y);
  if(!hit || (hit!==el && !el.contains(hit))) return {ok:false, reason:"not receiving pointer events", box:b};
  if(retainToken) nsRetainedElements().set(retainToken,el);
  return {ok:true, x:x, y:y, box:b};
}
function nsInspectElement(e){
      if(!e) return {found:false};
      var attrs={}; for(var i=0;i<e.attributes.length;i++){ attrs[e.attributes[i].name]=e.attributes[i].value; }
      var ancestors=[]; var parent=e.parentElement;
      while(parent&&ancestors.length<4){
        var parentText=nsText(parent);
        if(parentText){ ancestors.push({tagName:parent.tagName,role:nsRole(parent),accessibleName:nsAccName(parent),text:parentText.slice(0,400)}); }
        parent=parent.parentElement;
      }
      return {found:true, tagName:e.tagName, id:e.id||"", className:typeof e.className==="string"?e.className:"", text:nsText(e).slice(0,4000), role:nsRole(e), accessibleName:nsAccName(e), visible:nsVisible(e), attributes:attrs, boundingBox:nsBox(e), ancestors:ancestors};
    }
function nsFailureEvidence(descriptor){
  var matches=nsLocate(descriptor), steps=descriptor.steps||[], boundary=steps.length-1;
  while(boundary>=0&&!steps[boundary].by) boundary--;
  var roots=boundary>0?nsLocate({steps:steps.slice(0,boundary)}):[];
  var scope=roots.length?"container":"page";
  if(!roots.length) roots=[document.body||document.documentElement];
  var text=roots.filter(Boolean).map(function(root){return root.innerText==null?"":String(root.innerText);}).join("\n");
  var url=String(location.href);
  return {capturedAt:Date.now(),url:url.slice(0,2000),urlTruncated:url.length>2000,matchCount:matches.length,matchesTruncated:matches.length>8,
    matches:matches.slice(0,8).map(function(e){var text=nsText(e), name=nsAccName(e);return {tagName:e.tagName,role:nsRole(e),accessibleName:name.slice(0,300),accessibleNameTruncated:name.length>300,text:text.slice(0,300),textTruncated:text.length>300,visible:nsVisible(e),enabled:nsEnabled(e),checked:nsCheckedObservation(e)};}),
    snapshot:{scope:scope,scopeCount:roots.length,text:text.slice(0,4000),totalChars:text.length,truncated:text.length>4000}};
}
async function __nsRun(P){
  var d=P.descriptor, a=P.arg, t=P.timeout;
  try { switch(P.op){
    case "probe": return nsActionable(d, a&&a.retainToken);
    case "failureEvidence": return nsFailureEvidence(d);
    case "waitFor": { await nsWaitForState(d, P.state||"visible", t); return true; }
    case "count": return nsLocate(d).length;
    case "exists": return !!nsFirst(d);
    case "isVisible": { var e=nsFirst(d); return !!e && nsVisible(e); }
    case "checkedState":
    case "isChecked": { var e=nsFirst(d); return !!e && nsCheckedState(e); }
    case "retainedCheckedState": { var e=nsRetainedElement(a.token); if(!e.isConnected) throw new Error("Retained element was detached during the action"); return nsCheckedState(e); }
    case "retainedCheckedStateEquals": { var e=nsRetainedElement(a.token); if(!e.isConnected) throw new Error("Retained element was detached during the action"); if(nsCheckedState(e)===a.checked) return true; return {__nsLocatorFailure:"state-timeout",state:a.checked?"checked":"unchecked",timeout:t}; }
    case "releaseRetainedElement": return nsRetainedElements().delete(a.token);
    case "isEnabled": { var e=nsFirst(d); return !!e && nsEnabled(e); }
    case "isDisabled": { var e=nsFirst(d); return !!e && !nsEnabled(e); }
    case "isEditable": { var e=nsFirst(d); return !!e && nsEditable(e); }
    case "textContent": { var e=nsFirst(d); return e?e.textContent:null; }
    case "innerText": { var e=await nsWaitForState(d,"attached",t); return e.innerText!=null?e.innerText:(e.textContent||""); }
    case "inputValue": { var e=await nsWaitForState(d,"attached",t); return "value" in e ? e.value : ""; }
    case "getAttribute": { var e=await nsWaitForState(d,"attached",t); return e.getAttribute(a.name); }
    case "boundingBox": { var e=nsFirst(d); return e?nsBox(e):null; }
    case "allTextContents": return nsLocate(d).map(function(e){ return e.textContent||""; });
    case "allInnerTexts": return nsLocate(d).map(function(e){ return e.innerText!=null?e.innerText:(e.textContent||""); });
    case "evaluate": { var e=await nsWaitForState(d,"attached",t); var fn=(0,eval)("("+a.source+")"); return await fn(e,a.arg); }
    case "evaluateAll": { var fn=(0,eval)("("+a.source+")"); return await fn(nsLocate(d),a.arg); }
    case "roleCandidates": {
      var original=d.steps||[]; var roleIndex=-1;
      for(var ri=original.length-1;ri>=0;ri--){ if(original[ri].by==="role"&&original[ri].name!=null){ roleIndex=ri; break; } }
      if(roleIndex<0) return [];
      var steps=original.slice(0,roleIndex+1); var named=steps[roleIndex];
      var relaxed={}; for(var key in named){ if(key!=="name"&&key!=="exact") relaxed[key]=named[key]; }
      steps[roleIndex]=relaxed;
      var sameRole=nsLocate({steps:steps}).filter(nsVisible);
      var seen={}, sameName=Array.prototype.slice.call(document.querySelectorAll("*")).filter(function(e){
        if(!nsVisible(e)||!nsValueMatch(nsAccName(e),named.name,named.exact)) return false;
        var role=nsRole(e), name=nsAccName(e), key=role+"\n"+name;
        if(!role||seen[key]) return false;
        seen[key]=true;
        return true;
      });
      var included={};
      return sameName.concat(sameRole).filter(function(e){
        var key=nsRole(e)+"\n"+nsAccName(e);
        if(included[key]) return false;
        included[key]=true;
        return true;
      }).slice(0,10).map(function(e){ return {role:nsRole(e), accessibleName:nsAccName(e), text:nsText(e).slice(0,160)}; });
    }
    case "inspect": return nsInspectElement(nsFirst(d));
    case "fill": { var e=await nsWaitForState(d,"visible",t); var target=nsInspectElement(e); if(!("value" in e) && !e.isContentEditable) throw new Error("Element is not fillable"); e.focus&&e.focus(); if(e.isContentEditable) e.textContent=a.value; else nsSetNativeProperty(e,"value",a.value); nsDispatchInput(e,a.value); await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "clear": { var e=await nsWaitForState(d,"visible",t); var target=nsInspectElement(e); e.focus&&e.focus(); if(e.isContentEditable) e.textContent=""; else nsSetNativeProperty(e,"value",""); nsDispatchInput(e,""); await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "selectOption": { var e=await nsWaitForState(d,"visible",t); var target=nsInspectElement(e); if(!e.tagName || e.tagName.toLowerCase()!=="select") throw new Error("Element is not a select"); var vals=a.values; var picked=[]; for(var i=0;i<e.options.length;i++){ var o=e.options[i]; var hit=vals.some(function(matcher){ return nsSelectOptionMatch(o,matcher,i); }); o.selected=hit; if(hit) picked.push(o.value); } e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); await nsAfterAction(); return {__nsActionOutcome:true, value:picked, target:target}; }
    case "setInputFiles": {
      var e=await nsWaitForState(d,"attached",t);
      if(e.tagName!=="INPUT" || e.type!=="file") throw new Error("setInputFiles requires an input of type file");
      if(e.webkitdirectory) throw new Error("Directory uploads require directory entries, not file payloads");
      if(!e.multiple && a.files.length>1) throw new Error("File input does not allow multiple files");
      var target=nsInspectElement(e), transfer=new DataTransfer();
      for(var f of a.files){
        var raw=atob(f.base64), bytes=Uint8Array.from(raw,function(c){return c.charCodeAt(0);});
        transfer.items.add(new File([bytes],f.name,{type:f.mimeType}));
      }
      nsSetNativeProperty(e,"files",transfer.files);
      e.dispatchEvent(new Event("input",{bubbles:true}));
      e.dispatchEvent(new Event("change",{bubbles:true}));
      await nsAfterAction();
      return {__nsActionOutcome:true,value:true,target:target};
    }
    case "focus": { var e=await nsWaitForState(d,"visible",t); var target=nsInspectElement(e); e.focus&&e.focus(); await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "blur": { var e=await nsWaitForState(d,"attached",t); var target=nsInspectElement(e); e.blur&&e.blur(); await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "scrollIntoView": { var e=await nsWaitForState(d,"attached",t); var target=nsInspectElement(e); e.scrollIntoView({block:"center",inline:"center"}); await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "selectText": { var e=await nsWaitForState(d,"visible",t); var target=nsInspectElement(e); if(e.select) e.select(); else { var r=document.createRange(); r.selectNodeContents(e); var sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); } await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "dispatchEvent": { var e=await nsWaitForState(d,"attached",t); var target=nsInspectElement(e); e.dispatchEvent(new Event(a.type,{bubbles:true})); await nsAfterAction(); return {__nsActionOutcome:true, value:true, target:target}; }
    case "focusForKey": { var e=await nsWaitForState(d,"visible",t); e.focus&&e.focus(); await nsAfterAction(); return true; }
    default: throw new Error("Unknown op: "+P.op);
  }} catch(error) { if(error&&error.__nsLocatorFailure) return error.__nsLocatorFailure; throw error; }
}
`;

const KEY_DEFS: Record<
  string,
  { keyCode?: number; key?: string; text?: string }
> = {
  Enter: { keyCode: 13, key: "Enter", text: "\r" },
  Tab: { keyCode: 9, key: "Tab" },
  Escape: { keyCode: 27, key: "Escape" },
  Backspace: { keyCode: 8, key: "Backspace" },
  Delete: { keyCode: 46, key: "Delete" },
  ArrowUp: { keyCode: 38, key: "ArrowUp" },
  ArrowDown: { keyCode: 40, key: "ArrowDown" },
  ArrowLeft: { keyCode: 37, key: "ArrowLeft" },
  ArrowRight: { keyCode: 39, key: "ArrowRight" },
  Home: { keyCode: 36, key: "Home" },
  End: { keyCode: 35, key: "End" },
  PageUp: { keyCode: 33, key: "PageUp" },
  PageDown: { keyCode: 34, key: "PageDown" },
  Space: { keyCode: 32, key: " ", text: " " },
  Alt: { keyCode: 18, key: "Alt" },
  Control: { keyCode: 17, key: "Control" },
  Meta: { keyCode: 91, key: "Meta" },
  Shift: { keyCode: 16, key: "Shift" },
};

const MODIFIER_BITS: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
};

function normalizeKey(key: string): string {
  if (key === "Ctrl") return "Control";
  if (key === "Cmd") return "Meta";
  return key;
}

type RuntimeExceptionDetails = {
  text?: string;
  lineNumber?: number;
  columnNumber?: number;
  url?: string;
  exception?: { value?: unknown; description?: string };
  stackTrace?: {
    callFrames?: Array<{
      functionName?: string;
      url?: string;
      lineNumber?: number;
      columnNumber?: number;
    }>;
  };
};

function formatRuntimeException(details: RuntimeExceptionDetails): string {
  const remote = details.exception;
  const value =
    remote && Object.prototype.hasOwnProperty.call(remote, "value")
      ? String(remote.value)
      : undefined;
  const primary =
    remote?.description || value || details.text || "Unknown browser exception";
  const frames = details.stackTrace?.callFrames ?? [];
  const stack =
    frames.length > 0 && !primary.includes("\n")
      ? frames
          .slice(0, 8)
          .map((frame) => {
            const name = frame.functionName || "<anonymous>";
            const url = frame.url || details.url || "<page>";
            const line =
              typeof frame.lineNumber === "number"
                ? `:${frame.lineNumber + 1}`
                : "";
            const column =
              typeof frame.columnNumber === "number"
                ? `:${frame.columnNumber + 1}`
                : "";
            return `    at ${name} (${url}${line}${column})`;
          })
          .join("\n")
      : "";
  const location =
    !stack &&
    !primary.includes("\n") &&
    (details.url ||
      typeof details.lineNumber === "number" ||
      typeof details.columnNumber === "number")
      ? `\n    at ${details.url || "<page>"}${
          typeof details.lineNumber === "number"
            ? `:${details.lineNumber + 1}`
            : ""
        }${typeof details.columnNumber === "number" ? `:${details.columnNumber + 1}` : ""}`
      : "";
  return `Browser evaluation failed: ${primary}${stack ? `\n${stack}` : location}`;
}

/** Identity of the session owning the inspected target, not a newly acquired generation. */
export interface CdpInspectionIdentity {
  panelId: string;
  attemptId: string;
  runtimeEntityId: string;
  buildKey: string | null;
}

export type CdpLocatorEvidence = {
  session?: CdpInspectionIdentity;
} & (
  | {
      status: "captured";
      capturedAt: number;
      url: string;
      urlTruncated: boolean;
      matchCount: number;
      matchesTruncated: boolean;
      matches: Array<{
        tagName: string;
        role: string;
        accessibleName: string;
        accessibleNameTruncated: boolean;
        text: string;
        textTruncated: boolean;
        visible: boolean;
        enabled: boolean;
        checked: boolean | null;
      }>;
      snapshot: {
        scope: "container" | "page";
        scopeCount: number;
        text: string;
        totalChars: number;
        truncated: boolean;
      };
    }
  | { status: "unavailable"; reason: string }
);

export interface CdpFailureData {
  code:
    | "cdp_target_connection_failed"
    | "cdp_target_closed"
    | "cdp_target_crashed"
    | "cdp_target_detached"
    | "cdp_protocol_error"
    | "cdp_dialog_open"
    | "cdp_dialog_closed"
    | "cdp_evaluation_timeout"
    | "cdp_evaluation_failed"
    | "cdp_locator_operation_failed"
    | "cdp_locator_not_actionable"
    | "cdp_locator_state_mismatch"
    | "cdp_locator_ambiguous"
    | "cdp_interaction_outcome_not_observed"
    | "cdp_workspace_navigation_forbidden";
  operation: string;
  failureKind: "user-code" | "infrastructure";
  recovery:
    | "correct-page-function"
    | "reobserve-locator"
    | "reacquire-page"
    | "inspect-panel-and-reacquire-page"
    | "use-panel-handle-lifecycle"
    | "handle-dialog-and-observe";
  locator?: string;
  timeoutMs?: number;
  state?: WaitState;
  expectedLocator?: string;
  matchCount?: number;
  candidates?: Array<{ role: string; accessibleName: string; tagName: string }>;
  instruction?: string;
  dialog?: Readonly<CdpDialogData>;
  evidence?: CdpLocatorEvidence;
}

/** Structured locator failure preserving its original cause and post-failure evidence. */
export class CdpError extends Error {
  readonly locator?: string;
  readonly code: CdpFailureData["code"];
  readonly errorKind: "application" | "infrastructure";
  readonly errorData: CdpFailureData;
  constructor(
    message: string,
    options: {
      cause?: unknown;
      locator?: string;
      code?: CdpFailureData["code"];
      operation?: string;
      failureKind?: CdpFailureData["failureKind"];
      recovery?: CdpFailureData["recovery"];
      timeoutMs?: number;
      state?: WaitState;
      expectedLocator?: string;
      matchCount?: number;
      candidates?: CdpFailureData["candidates"];
      instruction?: string;
      dialog?: Readonly<CdpDialogData>;
      evidence?: CdpLocatorEvidence;
    } = {},
  ) {
    super(message);
    this.name = "CdpError";
    this.locator = options.locator;
    this.code = options.code ?? "cdp_locator_operation_failed";
    const failureKind = options.failureKind ?? "user-code";
    this.errorKind =
      failureKind === "infrastructure" ? "infrastructure" : "application";
    this.errorData = {
      code: this.code,
      operation: options.operation ?? "locator",
      failureKind,
      recovery: options.recovery ?? "reobserve-locator",
      ...(options.locator ? { locator: options.locator } : {}),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      ...(options.state ? { state: options.state } : {}),
      ...(options.expectedLocator
        ? { expectedLocator: options.expectedLocator }
        : {}),
      ...(options.matchCount === undefined
        ? {}
        : { matchCount: options.matchCount }),
      ...(options.candidates ? { candidates: options.candidates } : {}),
      ...(options.instruction ? { instruction: options.instruction } : {}),
      ...(options.dialog ? { dialog: options.dialog } : {}),
      ...(options.evidence ? { evidence: options.evidence } : {}),
    };
    if (options.cause !== undefined)
      (this as { cause?: unknown }).cause = options.cause;
  }
}

function serializeTextMatcher(value: TextMatcher): SerializedTextMatcher {
  return typeof value === "string"
    ? value
    : { regex: { source: value.source, flags: value.flags } };
}

/** Named roles identify controls; partial-name searches must be explicit. */
function roleLocatorStep(role: string, options: ByRoleOptions): LocatorStep {
  return {
    by: "role",
    value: role,
    name:
      options.name === undefined
        ? undefined
        : serializeTextMatcher(options.name),
    exact:
      options.exact ?? (typeof options.name === "string" ? true : undefined),
  };
}

/** Render a locator descriptor as a Playwright-style string for errors/toString(). */
function describeLocator(descriptor: LocatorDescriptor): string {
  const q = (s: string) => JSON.stringify(s);
  const matcher = (value: SerializedTextMatcher) =>
    typeof value === "string"
      ? q(value)
      : `/${value.regex.source.replace(/\//g, "\\/")}/${value.regex.flags}`;
  const parts = descriptor.steps.map((step) => {
    if ("filter" in step) {
      return `filter(${
        step.filter.hasText != null
          ? `{ hasText: ${matcher(step.filter.hasText)} }`
          : "{}"
      })`;
    }
    if ("nth" in step) {
      if (step.nth === 0) return "first()";
      if (step.nth === -1) return "last()";
      return `nth(${step.nth})`;
    }
    const exact = "exact" in step && step.exact ? ", { exact: true }" : "";
    switch (step.by) {
      case "css":
        return `locator(${q(step.value)})`;
      case "role": {
        const opts: string[] = [];
        if (step.name != null) opts.push(`name: ${matcher(step.name)}`);
        if (step.exact !== undefined) opts.push(`exact: ${step.exact}`);
        return `getByRole(${q(step.value)}${opts.length ? `, { ${opts.join(", ")} }` : ""})`;
      }
      case "text":
        return `getByText(${matcher(step.value)}${exact})`;
      case "label":
        return `getByLabel(${matcher(step.value)}${exact})`;
      case "placeholder":
        return `getByPlaceholder(${matcher(step.value)}${exact})`;
      case "testid":
        return `getByTestId(${q(step.value)})`;
      case "alt":
        return `getByAltText(${matcher(step.value)}${exact})`;
      case "title":
        return `getByTitle(${matcher(step.value)}${exact})`;
    }
  });
  return parts.length ? parts.join(".") : "locator()";
}

class WorkerCdpPage {
  private readonly dialogSubscriptions = new Map<DialogHandler, () => void>();
  dialog(): CdpDialog | null {
    return this.connection.dialog();
  }
  readonly frames: FrameRegistry;
  private readonly network: NetworkObserver;
  private readonly networkSubscriptions = new Map<
    Function,
    Map<CdpNetworkEvent, () => void>
  >();
  on(event: "dialog", handler: DialogHandler): this;
  on<K extends CdpNetworkEvent>(
    event: K,
    handler: (value: CdpNetworkEvents[K]) => void,
  ): this;
  on(event: "dialog" | CdpNetworkEvent, handler: any): this {
    if (event === "dialog") {
      if (!this.dialogSubscriptions.has(handler))
        this.dialogSubscriptions.set(
          handler,
          this.connection.onDialog(handler),
        );
    } else {
      if (
        !["request", "response", "requestfinished", "requestfailed"].includes(
          event,
        )
      )
        throw new TypeError(`Unsupported page event: ${event}`);
      const subscriptions = this.networkSubscriptions.get(handler) ?? new Map();
      if (!subscriptions.has(event))
        subscriptions.set(event, this.network.on(event, handler));
      this.networkSubscriptions.set(handler, subscriptions);
    }
    return this;
  }
  off(event: "dialog", handler: DialogHandler): this;
  off<K extends CdpNetworkEvent>(
    event: K,
    handler: (value: CdpNetworkEvents[K]) => void,
  ): this;
  off(event: "dialog" | CdpNetworkEvent, handler: any): this {
    if (event === "dialog") {
      this.dialogSubscriptions.get(handler)?.();
      this.dialogSubscriptions.delete(handler);
    } else {
      const subscriptions = this.networkSubscriptions.get(handler);
      subscriptions?.get(event)?.();
      subscriptions?.delete(event);
      if (!subscriptions?.size) this.networkSubscriptions.delete(handler);
    }
    return this;
  }
  /** Most recent 1000 requests; bodies are fetched only on explicit response.body/text/json calls. */
  requests() {
    return this.network.requests();
  }
  /** Register before the action; settles on a matching response or authoritative cancellation/disconnect. */
  waitForResponse(matcher: CdpResponseMatcher) {
    return this.network.waitForResponse(matcher);
  }
  private currentUrl = "";
  private mainFrameId: string | undefined;
  private currentViewportSize: CdpViewportSize | null = null;
  private defaultTimeout = Infinity;
  private readonly consoleBuffer: CdpConsoleEvent[] = [];
  private readonly pressedModifiers = new Set<string>();
  private retainedElementSequence = 0;
  private profileActive = false;
  private readonly retainedElementOwner = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  readonly keyboard: Keyboard = {
    down: async (key) => {
      await this.keyDown(key);
      await this.afterAction();
    },
    up: async (key) => {
      await this.keyUp(key);
      await this.afterAction();
    },
    press: (key) => this.pressKey(key),
    type: async (text) => {
      for (const character of text) await this.pressKey(character);
    },
    insertText: async (text) => {
      await this.connection.send("Input.insertText", { text });
      await this.afterAction();
    },
  };

  constructor(
    readonly connection: CdpChannel,
    private readonly onInteraction?: (outcome: CdpInteractionOutcome) => void,
    private readonly inspectionIdentity?: CdpInspectionIdentity,
    frames?: FrameRegistry,
    private readonly browserOperation?: BrowserOperation,
    network?: NetworkObserver,
  ) {
    this.frames = frames ?? new FrameRegistry(connection);
    this.network = network ?? new NetworkObserver(connection);
    if (!network)
      this.frames.onChannel((channel) => {
        if (channel !== connection) this.network.attach(channel);
      });
    // Passive teardown must not retain an invocation's cancellation owner.
    this.connection.onClosed((error) => {
      if (!network) this.network.close(error);
      if (!frames) this.frames.close();
    });
    this.connection.on("Page.frameNavigated", (params) => {
      const frame = (params as { frame?: { id?: string; parentId?: string } })
        .frame;
      if (frame && !frame.parentId) this.mainFrameId = frame.id;
    });
    this.connection.on("Runtime.consoleAPICalled", (params) => {
      const event = params as {
        type?: string;
        args?: Array<{ value?: unknown; description?: string; type?: string }>;
      };
      const args = (event.args ?? []).map((arg) =>
        Object.prototype.hasOwnProperty.call(arg, "value")
          ? arg.value
          : arg.description,
      );
      this.consoleBuffer.push({
        type: event.type ?? "log",
        text: args.map((arg) => String(arg)).join(" "),
        args,
      });
    });
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.connection.send("Inspector.enable"),
      this.connection.send("Page.enable"),
      this.connection.send("Runtime.enable"),
      this.connection.send("DOM.enable"),
      this.connection.send("Network.enable"),
      this.frames.autoAttach(),
    ]);
    const frameTree = (await this.connection.send("Page.getFrameTree")) as {
      frameTree?: { frame?: { id?: string } };
    };
    this.mainFrameId = frameTree.frameTree?.frame?.id;
    this.currentUrl = String(
      (await this.evaluateInternal(() => location.href)) ?? "",
    );
    const viewport = await this.evaluateInternal(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    if (
      viewport &&
      typeof viewport === "object" &&
      typeof (viewport as CdpViewportSize).width === "number" &&
      typeof (viewport as CdpViewportSize).height === "number"
    ) {
      this.currentViewportSize = viewport as CdpViewportSize;
    }
  }

  private nativeBrowserOperation(): BrowserOperation {
    if (!this.browserOperation)
      throw new Error(
        "Downloads and popup discovery require a hosted PanelHandle.cdp page",
      );
    return async (request) => {
      const owner = new AbortController();
      const release = this.connection.onDisconnect((error) =>
        owner.abort(error),
      );
      try {
        owner.signal.throwIfAborted();
        return await this.browserOperation!(request, owner.signal);
      } finally {
        release();
      }
    };
  }
  /** Register before the action; returns the canonical child panel ID for panelTree.get(id). */
  private waitForBrowserActivity<T>(
    activity: "popup" | "download",
  ): Promise<T> {
    this.nativeBrowserOperation();
    return new Promise((resolve, reject) => {
      const cleanup: Array<() => void> = [];
      let settled = false;
      const finish = (value?: T, error?: Error) => {
        if (settled) return;
        settled = true;
        for (const release of cleanup) release();
        if (error) reject(error);
        else resolve(value!);
      };
      cleanup.push(
        this.connection.on(`Vibestudio.${activity}`, (raw) => {
          const payload = raw as { popup?: T; download?: T; error?: string };
          if (payload.error) finish(undefined, new Error(payload.error));
          else finish(payload[activity]);
        }),
      );
      const release = this.connection.onDisconnect((error) =>
        finish(undefined, error),
      );
      if (settled) release();
      else cleanup.push(release);
    });
  }
  waitForPopup(): Promise<BrowserPopup> {
    return this.waitForBrowserActivity("popup");
  }
  async waitForDownload(): Promise<CdpDownload> {
    const operation = this.nativeBrowserOperation();
    return new CdpDownload(
      await this.waitForBrowserActivity<BrowserDownload>("download"),
      operation,
    );
  }
  async downloads(): Promise<CdpDownload[]> {
    const operation = this.nativeBrowserOperation();
    return (
      (await operation({ operation: "listDownloads" })) as BrowserDownload[]
    ).map((record) => new CdpDownload(record, operation));
  }
  frameLocator(selector: string): WorkerCdpFrameLocator {
    return new WorkerCdpFrameLocator(this, {
      steps: [compileLocatorSelector(selector)],
    });
  }
  /** @internal Resolve the iframe owner in its parent's execution context. */
  async resolveFrame(
    descriptor: LocatorDescriptor,
  ): Promise<{ frameId: string; objectId: string }> {
    await this.runLocatorOp("waitFor", descriptor, null, { state: "attached" });
    const result = (await this.connection.send("Runtime.evaluate", {
      expression: `(function(){${INPAGE} return nsFirst(${JSON.stringify(descriptor)});})()`,
      returnByValue: false,
    })) as {
      result?: { objectId?: string };
      exceptionDetails?: RuntimeExceptionDetails;
    };
    if (result.exceptionDetails)
      throw new Error(formatRuntimeException(result.exceptionDetails));
    const objectId = result.result?.objectId;
    if (!objectId) throw new Error("Frame locator has no attached element");
    try {
      const node = (await this.connection.send("DOM.describeNode", {
        objectId,
      })) as { node: { nodeName: string; frameId?: string } };
      if (
        !node.node.frameId ||
        !["IFRAME", "FRAME"].includes(node.node.nodeName)
      )
        throw new Error("frameLocator requires an iframe or frame element");
      return { frameId: node.node.frameId, objectId };
    } catch (error) {
      await this.connection
        .send("Runtime.releaseObject", { objectId })
        .catch(() => undefined);
      throw error;
    }
  }
  /** @internal */ framePage(descriptor: LocatorDescriptor): WorkerCdpPage {
    return new WorkerCdpPage(
      new FrameChannel(this, descriptor),
      this.onInteraction,
      this.inspectionIdentity,
      this.frames,
      this.browserOperation,
      this.network,
    );
  }

  // ---- Navigation -------------------------------------------------------
  async goto(url: string): Promise<unknown> {
    const settled = this.waitForNavigationSettled();
    let result: { frameId?: string; errorText?: string; isDownload?: boolean };
    try {
      result = (await this.connection.send("Page.navigate", { url })) as {
        frameId?: string;
        errorText?: string;
        isDownload?: boolean;
      };
    } catch (error) {
      settled.cancel();
      throw error;
    }
    // Await the navigation settling (main frame stops loading / load event fires) before returning.
    // Without this, `goto` returns the instant Page.navigate is acknowledged, so a follow-up
    // screenshot/evaluate races the in-flight navigation — during a cross-origin swap the page is
    // momentarily detached and the command fails with "Not attached to an active page".
    // Readiness is established by lifecycle events, never by elapsed time.
    if (result.isDownload) {
      settled.cancel();
    } else if (!result.errorText) {
      settled.setFrameId(result.frameId);
      await settled.promise;
    } else {
      settled.cancel();
      throw new Error(`Page.navigate failed: ${result.errorText}`);
    }
    this.currentUrl = url;
    return result;
  }

  /** Join navigation lifecycle; propagate target loss instead of manufacturing readiness. */
  private waitForNavigationSettled(): {
    promise: Promise<void>;
    setFrameId(frameId: string | undefined): void;
    cancel(): void;
  } {
    let frameId = this.mainFrameId;
    const stoppedFrames = new Set<string>();
    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    // Navigation command may still be pending when the connection fails.
    void promise.catch(() => {});
    const cleanups: Array<() => void> = [];
    let finished = false;
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    // Install listeners before Page.navigate. Fast navigations can emit their
    // lifecycle event before the navigate response reaches the client.
    cleanups.push(this.connection.on("Page.loadEventFired", () => finish()));
    const observeFrameCompletion = (params: unknown): void => {
      const fid = (params as { frameId?: string }).frameId;
      if (!fid) return;
      if (frameId) {
        if (fid === frameId) finish();
      } else {
        stoppedFrames.add(fid);
      }
    };
    cleanups.push(
      this.connection.on("Page.frameStoppedLoading", observeFrameCompletion),
    );
    cleanups.push(
      this.connection.on(
        "Page.navigatedWithinDocument",
        observeFrameCompletion,
      ),
    );
    cleanups.push(this.connection.onDisconnect((error) => finish(error)));
    return {
      promise,
      setFrameId: (nextFrameId) => {
        frameId = nextFrameId ?? frameId;
        if (frameId && stoppedFrames.has(frameId)) finish();
      },
      cancel: () => finish(),
    };
  }

  async reload(): Promise<void> {
    const settled = this.waitForNavigationSettled();
    try {
      await this.connection.send("Page.reload", {});
      await settled.promise;
    } catch (error) {
      settled.cancel();
      throw error;
    }
  }

  async goBack(): Promise<void> {
    await this.navigateHistory(-1);
  }

  async goForward(): Promise<void> {
    await this.navigateHistory(1);
  }

  private async navigateHistory(delta: number): Promise<void> {
    const history = (await this.connection.send(
      "Page.getNavigationHistory",
      {},
    )) as {
      currentIndex: number;
      entries: Array<{ id: number }>;
    };
    const target = history.entries[history.currentIndex + delta];
    if (!target) return;
    const settled = this.waitForNavigationSettled();
    try {
      await this.connection.send("Page.navigateToHistoryEntry", {
        entryId: target.id,
      });
      await settled.promise;
    } catch (error) {
      settled.cancel();
      throw error;
    }
  }

  async title(): Promise<string> {
    return String((await this.evaluateInternal(() => document.title)) ?? "");
  }

  url(): string {
    return this.currentUrl;
  }

  async content(): Promise<string> {
    return String(
      (await this.evaluateInternal(
        () => document.documentElement?.outerHTML ?? "",
      )) ?? "",
    );
  }

  /** Set a caller-selected deadline for actions/reads. By default there is no deadline. */
  setDefaultTimeout(timeoutMs: number): void {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
      throw new TypeError("Timeout must be a nonnegative finite number");
    this.defaultTimeout = timeoutMs === 0 ? Infinity : timeoutMs;
  }

  /** Emulate a CSS viewport using the canonical CDP device-metrics override. */
  async setViewportSize(viewportSize: CdpViewportSize): Promise<void> {
    const { width, height } = viewportSize;
    if (
      !Number.isInteger(width) ||
      width <= 0 ||
      !Number.isInteger(height) ||
      height <= 0
    ) {
      throw new TypeError(
        `setViewportSize requires positive integer width and height; received ${JSON.stringify(
          viewportSize,
        )}`,
      );
    }
    await this.connection.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    this.currentViewportSize = { width, height };
  }

  viewportSize(): CdpViewportSize | null {
    return this.currentViewportSize ? { ...this.currentViewportSize } : null;
  }

  /**
   * Measure one bounded reload or interaction using browser-native CDP metrics.
   * The callback owns readiness/settling so the report describes the exact
   * user-visible boundary chosen by the caller.
   */
  async profile(
    action: () => unknown | Promise<unknown>,
    options?: CdpProfileOptions,
  ): Promise<CdpProfileReport> {
    if (this.profileActive) {
      throw new Error("A profiling operation is already active on this page");
    }
    this.profileActive = true;
    try {
      return await runCdpProfile({
        page: this,
        transport: this.connection,
        networkAlreadyEnabled: true,
        action,
        options,
      });
    } finally {
      this.profileActive = false;
    }
  }

  // ---- Evaluate ---------------------------------------------------------
  async evaluate<Result = unknown, Arg = unknown>(
    pageFunction: string | ((arg: Arg) => Result | Promise<Result>),
    arg?: Arg,
    options: { timeout?: number; operation?: string } = {},
  ): Promise<Result> {
    const expression =
      typeof pageFunction === "function"
        ? `(${pageFunction.toString()})(${JSON.stringify(arg)})`
        : pageFunction;
    return this.evaluateExpression(
      expression,
      options.operation ?? "Runtime.evaluate",
      options.timeout,
    ) as Promise<Result>;
  }

  /** Internal browser reads settle through the owning CDP response or lifecycle. */
  private async evaluateInternal(
    pageFunction: string | ((arg?: unknown) => unknown),
    arg?: unknown,
  ): Promise<unknown> {
    const expression =
      typeof pageFunction === "function"
        ? `(${pageFunction.toString()})(${JSON.stringify(arg)})`
        : pageFunction;
    return this.evaluateExpression(expression, "Runtime.evaluate");
  }

  private async evaluateExpression(
    expression: string,
    operation: string,
    timeout?: number,
  ): Promise<unknown> {
    const result = (await this.connection.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(timeout === undefined ? {} : { timeout }),
    })) as {
      result?: { value?: unknown };
      exceptionDetails?: RuntimeExceptionDetails;
    };
    if (result.exceptionDetails) {
      throw new CdpError(formatRuntimeException(result.exceptionDetails), {
        code: "cdp_evaluation_failed",
        operation,
        recovery: "correct-page-function",
      });
    }
    return result.result?.value;
  }

  /** One bounded, read-only observation after failure; never recurse through locator recovery. */
  private async captureLocatorEvidence(
    descriptor: LocatorDescriptor,
  ): Promise<CdpLocatorEvidence> {
    const session = this.inspectionIdentity;
    try {
      const observation = (await this.evaluate(
        `(async function(P){ ${INPAGE}\n return await __nsRun(P); })(${JSON.stringify({ op: "failureEvidence", descriptor })})`,
        undefined,
        { operation: "locator.failureEvidence" },
      )) as Omit<
        Extract<CdpLocatorEvidence, { status: "captured" }>,
        "status" | "session"
      >;
      if (!observation || typeof observation.capturedAt !== "number")
        throw new Error("Browser returned no failure observation");
      return {
        ...observation,
        status: "captured",
        ...(session ? { session } : {}),
      };
    } catch (error) {
      return {
        status: "unavailable",
        reason: (error instanceof Error ? error.message : String(error)).slice(
          0,
          500,
        ),
        ...(session ? { session } : {}),
      };
    }
  }

  /** Run an in-page op against a locator descriptor; failures name the locator. */
  async runLocatorOp(
    op: string,
    descriptor: LocatorDescriptor,
    arg: unknown,
    opts: { timeout?: number; state?: WaitState } = {},
  ): Promise<unknown> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    const payload = {
      op,
      descriptor,
      arg: arg ?? null,
      timeout,
      state: opts.state ?? null,
    };
    try {
      const deadline = timeout === 0 ? Infinity : Date.now() + timeout;
      for (;;) {
        const expr = `(async function(P){ ${INPAGE}\n return await __nsRun(P); })(${JSON.stringify(
          payload,
        )})`;
        const result = await this.evaluate(expr, undefined, {
          operation: `locator.${op}`,
        });
        if (
          result &&
          typeof result === "object" &&
          (result as { __nsLocatorFailure?: string }).__nsLocatorFailure ===
            "ambiguous"
        ) {
          const failure = result as {
            matchCount: number;
            candidates: NonNullable<CdpFailureData["candidates"]>;
          };
          throw new CdpError(
            `Locator matched ${failure.matchCount} elements: ${failure.candidates.map((candidate) => `${candidate.role || candidate.tagName} ${JSON.stringify(candidate.accessibleName)}`).join(", ")}`,
            {
              code: "cdp_locator_ambiguous",
              operation: op,
              recovery: "reobserve-locator",
              matchCount: failure.matchCount,
              candidates: failure.candidates,
              instruction:
                "Inspect the matching controls and narrow the locator to the intended element before acting.",
            },
          );
        }
        if (
          !result ||
          typeof result !== "object" ||
          (result as { __nsLocatorFailure?: unknown }).__nsLocatorFailure !==
            "state-timeout"
        ) {
          if (
            [
              "fill",
              "clear",
              "selectOption",
              "setInputFiles",
              "focus",
              "blur",
              "scrollIntoView",
              "selectText",
              "dispatchEvent",
            ].includes(op)
          ) {
            if (
              !result ||
              typeof result !== "object" ||
              (result as { __nsActionOutcome?: unknown }).__nsActionOutcome !==
                true
            ) {
              throw new Error(
                `Native locator ${op} returned no action observation`,
              );
            }
            const observed = result as {
              value: unknown;
              target: Omit<CdpDomInspection, "selector">;
            };
            this.recordLocatorInteraction(
              op as CdpInteractionOutcome["action"],
              descriptor,
              observed.target,
            );
            return observed.value;
          }
          return result;
        }
        const state =
          (result as { state?: WaitState }).state ?? opts.state ?? "visible";
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new CdpError(
            `Timeout ${timeout}ms waiting for element to be ${state}`,
            {
              code: "cdp_locator_state_mismatch",
              operation: op,
              recovery: "reobserve-locator",
              timeoutMs: timeout,
              state,
            },
          );
        }
        // Yield outside Runtime.evaluate. A long-lived in-page polling promise
        // can prevent Chromium from delivering a preceding CDP Input event to
        // the renderer, making the click's effect appear only after the wait
        // itself times out.
        await this.pauseObservation(Math.min(50, remaining));
      }
    } catch (err) {
      const where = describeLocator(descriptor);
      const detail = err instanceof Error ? err.message : String(err);
      const evidence =
        err instanceof CdpError && err.errorData.evidence
          ? err.errorData.evidence
          : err instanceof CdpError &&
              ["cdp_locator_state_mismatch", "cdp_locator_ambiguous"].includes(
                err.code,
              )
            ? await this.captureLocatorEvidence(descriptor)
            : undefined;
      if (err instanceof CdpError) {
        throw new CdpError(`${op} failed on ${where}: ${detail}`, {
          cause: err,
          locator: where,
          code: err.code,
          operation: op,
          failureKind: err.errorData.failureKind,
          recovery: err.errorData.recovery,
          timeoutMs: err.errorData.timeoutMs,
          state: err.errorData.state,
          expectedLocator: err.errorData.expectedLocator,
          matchCount: err.errorData.matchCount,
          candidates: err.errorData.candidates,
          instruction: err.errorData.instruction,
          dialog: err.errorData.dialog,
          evidence,
        });
      }
      throw new CdpError(`${op} failed on ${where}: ${detail}`, {
        cause: err,
        locator: where,
        code: "cdp_locator_operation_failed",
        operation: op,
        recovery: "reobserve-locator",
        evidence,
      });
    }
  }

  // ---- Locators ---------------------------------------------------------
  locator(selector: string): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [compileLocatorSelector(selector)],
    });
  }
  getByRole(role: string, options: ByRoleOptions = {}): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [roleLocatorStep(role, options)],
    });
  }
  getByText(text: TextMatcher, options: ByTextOptions = {}): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [
        { by: "text", value: serializeTextMatcher(text), exact: options.exact },
      ],
    });
  }
  getByLabel(text: TextMatcher, options: ByTextOptions = {}): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [
        {
          by: "label",
          value: serializeTextMatcher(text),
          exact: options.exact,
        },
      ],
    });
  }
  getByPlaceholder(
    text: TextMatcher,
    options: ByTextOptions = {},
  ): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [
        {
          by: "placeholder",
          value: serializeTextMatcher(text),
          exact: options.exact,
        },
      ],
    });
  }
  getByTestId(testId: string): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [{ by: "testid", value: testId }],
    });
  }
  getByAltText(
    text: TextMatcher,
    options: ByTextOptions = {},
  ): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [
        { by: "alt", value: serializeTextMatcher(text), exact: options.exact },
      ],
    });
  }
  getByTitle(text: TextMatcher, options: ByTextOptions = {}): WorkerCdpLocator {
    return new WorkerCdpLocator(this, {
      steps: [
        {
          by: "title",
          value: serializeTextMatcher(text),
          exact: options.exact,
        },
      ],
    });
  }

  // ---- Waits ------------------------------------------------------------
  async waitForTimeout(timeout: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, timeout));
  }

  async waitForFunction(
    pageFunction: string | ((arg?: unknown) => unknown),
    arg?: unknown,
    options?: { timeout?: number; polling?: number | "raf" },
  ): Promise<unknown> {
    let actualArg = arg;
    let actualOptions = options ?? {};
    if (
      options === undefined &&
      arg &&
      typeof arg === "object" &&
      ("timeout" in arg || "polling" in arg)
    ) {
      actualArg = undefined;
      actualOptions = arg as { timeout?: number; polling?: number | "raf" };
    }
    const timeout = actualOptions.timeout ?? this.defaultTimeout;
    const polling =
      typeof actualOptions.polling === "number" && actualOptions.polling > 0
        ? actualOptions.polling
        : 50;
    const source =
      typeof pageFunction === "function"
        ? `(${pageFunction.toString()})`
        : pageFunction;
    const isFunction = typeof pageFunction === "function";

    const expression = `(async function(source, isFunction, arg) {
      const predicate = isFunction ? (0, eval)(source) : new Function("arg", "return (" + source + ")");
      let value = await (typeof predicate === "function" ? predicate(arg) : predicate);
      if (typeof value === "function") value = await value(arg);
      return value;
    })(${JSON.stringify(source)}, ${JSON.stringify(isFunction)}, ${JSON.stringify(actualArg)})`;
    const deadline = timeout === 0 ? Infinity : Date.now() + timeout;
    for (;;) {
      const budget = deadline - Date.now();
      const value = await this.evaluate(expression, undefined, {
        operation: "waitForFunction",
        ...(Number.isFinite(budget) ? { timeout: Math.max(1, budget) } : {}),
      });
      if (value) return value;
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw new Error(`Timeout ${timeout}ms exceeded waiting for function`);
      await this.pauseObservation(Math.min(polling, remaining));
    }
  }

  async waitForLoadState(
    state: "load" | "domcontentloaded" | "networkidle" = "load",
    options: { timeout?: number } = {},
  ): Promise<void> {
    if (state === "networkidle")
      throw new TypeError(
        "networkidle is not supported; observe the application's readiness condition explicitly",
      );
    await this.waitForFunction(
      (requested) =>
        requested === "domcontentloaded"
          ? document.readyState === "interactive" ||
            document.readyState === "complete"
          : document.readyState === "complete",
      state,
      options,
    );
  }

  /** Scheduling interval, not a deadline; target loss cancels the pending timer. */
  private pauseObservation(interval: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        resolve();
      }, interval);
      unsubscribe = this.connection.onDisconnect((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async waitForSelector(
    selector: string,
    options: { state?: WaitState; timeout?: number } = {},
  ): Promise<WorkerCdpElementHandle | null> {
    const loc = this.locator(selector);
    await loc.waitFor(options);
    if (options.state === "detached" || options.state === "hidden") return null;
    return new WorkerCdpElementHandle(this, {
      steps: [{ by: "css", value: selector }],
    });
  }

  // ---- Pointer / keyboard primitives (CDP Input) ------------------------
  /** Resolve a stable, actionable hit point for a descriptor (auto-waits). */
  async resolveHitPoint(
    descriptor: LocatorDescriptor,
    timeout: number = this.defaultTimeout,
    retainToken?: string,
  ): Promise<{ x: number; y: number }> {
    type ActionabilityProbe = {
      ok: boolean;
      x?: number;
      y?: number;
      reason?: string;
      box?: BoundingBox;
    };
    const deadline = timeout === 0 ? Infinity : Date.now() + timeout;
    let previousBox: BoundingBox | undefined;
    let probe: ActionabilityProbe = { ok: false, reason: "not found" };
    for (;;) {
      probe = (await this.runLocatorOp(
        "probe",
        descriptor,
        retainToken ? { retainToken } : null,
        { timeout: 0 },
      )) as ActionabilityProbe;
      const box = probe.box;
      const stable =
        probe.ok &&
        box !== undefined &&
        previousBox !== undefined &&
        Math.abs(previousBox.x - box.x) < 1 &&
        Math.abs(previousBox.y - box.y) < 1 &&
        Math.abs(previousBox.width - box.width) < 1 &&
        Math.abs(previousBox.height - box.height) < 1;
      if (
        stable &&
        typeof probe.x === "number" &&
        typeof probe.y === "number"
      ) {
        return { x: probe.x, y: probe.y };
      }
      previousBox = probe.ok ? box : undefined;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      // Keep Runtime.evaluate one-shot. Renderer input and framework work can
      // run while the worker waits between actionability observations.
      await this.pauseObservation(Math.min(30, remaining));
    }

    const where = describeLocator(descriptor);
    const candidates =
      probe.reason === "not found"
        ? ((await this.runLocatorOp("roleCandidates", descriptor, null, {
            timeout: 0,
          }).catch(() => [])) as Array<{
            role?: string;
            accessibleName?: string;
          }>)
        : [];
    const candidateHint =
      candidates.length > 0
        ? candidates.every(
            (candidate) => candidate.role === candidates[0]?.role,
          )
          ? ` Available ${candidates[0]?.role ?? "role"} names: ${candidates
              .map((candidate) =>
                JSON.stringify(candidate.accessibleName ?? ""),
              )
              .join(", ")}. Inspect the role locator before choosing a name.`
          : ` Available accessible targets: ${candidates
              .map(
                (candidate) =>
                  `${candidate.role ?? "unknown role"} ${JSON.stringify(
                    candidate.accessibleName ?? "",
                  )}`,
              )
              .join(", ")}. Use the rendered role and accessible name.`
        : "";
    throw new CdpError(
      `not actionable (${probe.reason ?? "timeout"}) after ${timeout}ms: ${where}.${candidateHint}`,
      {
        locator: where,
        code: "cdp_locator_not_actionable",
        operation: "click",
        recovery: "reobserve-locator",
        timeoutMs: timeout,
        evidence: await this.captureLocatorEvidence(descriptor),
      },
    );
  }

  private async dispatchClickAt(
    point: { x: number; y: number },
    opts: { clickCount?: number; button?: "left" | "right" | "middle" } = {},
  ): Promise<void> {
    const { x, y } = point;
    const button = opts.button ?? "left";
    const clickCount = opts.clickCount ?? 1;
    await this.connection.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
    });
    await this.connection.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button,
      clickCount,
    });
    await this.connection.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button,
      clickCount,
    });
    await this.afterAction();
  }

  async clickDescriptor(
    descriptor: LocatorDescriptor,
    opts: InteractionOptions & {
      clickCount?: number;
      button?: "left" | "right" | "middle";
    } = {},
  ): Promise<CdpInteractionOutcome> {
    const point = await this.resolveHitPoint(descriptor, opts.timeout);
    const target = (await this.runLocatorOp("inspect", descriptor, null, {
      timeout: 0,
    })) as Omit<CdpDomInspection, "selector"> & { found: boolean };
    await this.dispatchClickAt(point, opts);
    const action = opts.clickCount === 2 ? "dblclick" : "click";
    return this.observeInteraction(action, descriptor, target, opts);
  }

  private async observeInteraction(
    action: CdpInteractionOutcome["action"],
    descriptor: LocatorDescriptor,
    target: Omit<CdpDomInspection, "selector">,
    opts: InteractionOptions,
    delivery: CdpInteractionOutcome["delivery"] = "dispatched",
  ): Promise<CdpInteractionOutcome> {
    if (!opts.expect) {
      const outcome: CdpInteractionOutcome = {
        protocol: "cdp-interaction-outcome.v1",
        action,
        delivery,
        target: { selector: describeLocator(descriptor), ...target },
        effect: { status: "not-asserted" },
      };
      this.onInteraction?.(outcome);
      return outcome;
    }
    const state = opts.expect.state ?? "visible";
    try {
      await opts.expect.locator.waitFor({
        state,
        timeout: opts.expect.timeout ?? opts.timeout,
      });
    } catch (cause) {
      const expectedLocator = opts.expect.locator.toString();
      const timeoutMs =
        opts.expect.timeout ?? opts.timeout ?? this.defaultTimeout;
      // Delivery is an accomplished fact even when observing its effect fails.
      // Retain it before propagating the assertion error so recovery cannot
      // mistake this for a safe-to-replay, undispatched action.
      this.onInteraction?.({
        protocol: "cdp-interaction-outcome.v1",
        action,
        delivery,
        target: { selector: describeLocator(descriptor), ...target },
        effect: { status: "not-observed", locator: expectedLocator, state },
      });
      throw new CdpError(
        `${action} ${delivery === "dispatched" ? "was dispatched to" : "needed no event for"} ${describeLocator(descriptor)}, but expected ${expectedLocator} to become ${state}`,
        {
          cause,
          locator: describeLocator(descriptor),
          code: "cdp_interaction_outcome_not_observed",
          operation: action,
          recovery: "reobserve-locator",
          timeoutMs,
          state,
          expectedLocator,
          evidence:
            cause instanceof CdpError ? cause.errorData.evidence : undefined,
        },
      );
    }
    const outcome: CdpInteractionOutcome = {
      protocol: "cdp-interaction-outcome.v1",
      action,
      delivery,
      target: { selector: describeLocator(descriptor), ...target },
      effect: {
        status: "observed",
        locator: opts.expect.locator.toString(),
        state,
      },
    };
    this.onInteraction?.(outcome);
    return outcome;
  }

  private recordLocatorInteraction(
    action: CdpInteractionOutcome["action"],
    descriptor: LocatorDescriptor,
    target: Omit<CdpDomInspection, "selector">,
  ): void {
    this.onInteraction?.({
      protocol: "cdp-interaction-outcome.v1",
      action,
      delivery: "dispatched",
      target: { selector: describeLocator(descriptor), ...target },
      effect: { status: "not-asserted" },
    });
  }

  async hoverDescriptor(
    descriptor: LocatorDescriptor,
    opts: ActionOptions = {},
  ): Promise<void> {
    const { x, y } = await this.resolveHitPoint(descriptor, opts.timeout);
    const target = (await this.runLocatorOp("inspect", descriptor, null, {
      timeout: 0,
    })) as Omit<CdpDomInspection, "selector">;
    await this.connection.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
    });
    await this.afterAction();
    this.recordLocatorInteraction("hover", descriptor, target);
  }

  async pressDescriptor(
    descriptor: LocatorDescriptor,
    key: string,
    opts: InteractionOptions = {},
  ): Promise<CdpInteractionOutcome> {
    await this.runLocatorOp("focusForKey", descriptor, null, {
      timeout: opts.timeout,
    });
    const target = (await this.runLocatorOp("inspect", descriptor, null, {
      timeout: 0,
    })) as Omit<CdpDomInspection, "selector">;
    await this.pressKey(key);
    return this.observeInteraction("press", descriptor, target, opts);
  }

  async setCheckedDescriptor(
    descriptor: LocatorDescriptor,
    checked: boolean,
    opts: InteractionOptions = {},
  ): Promise<CdpInteractionOutcome> {
    const action = checked ? "check" : "uncheck";
    const state = checked ? "checked" : "unchecked";
    const observation = {
      ...opts,
      expect: opts.expect ?? {
        locator: new WorkerCdpLocator(this, descriptor),
        state,
      },
    } satisfies InteractionOptions;
    await this.runLocatorOp("waitFor", descriptor, null, {
      state: "attached",
      timeout: opts.timeout,
    });
    const initial = await this.runLocatorOp("checkedState", descriptor, null, {
      timeout: opts.timeout,
    });
    if (initial === checked) {
      const target = (await this.runLocatorOp("inspect", descriptor, null, {
        timeout: 0,
      })) as Omit<CdpDomInspection, "selector">;
      return this.observeInteraction(
        action,
        descriptor,
        target,
        observation,
        "not-needed",
      );
    }
    const retainToken = `${this.retainedElementOwner}-check-${++this.retainedElementSequence}`;
    const point = await this.resolveHitPoint(
      descriptor,
      opts.timeout,
      retainToken,
    );
    try {
      const retainedArg = { token: retainToken };
      const current = (await this.runLocatorOp(
        "retainedCheckedState",
        descriptor,
        retainedArg,
        {
          timeout: opts.timeout,
        },
      )) as boolean;
      const target = (await this.runLocatorOp("inspect", descriptor, null, {
        timeout: 0,
      })) as Omit<CdpDomInspection, "selector">;
      const delivery = current === checked ? "not-needed" : "dispatched";
      if (delivery === "dispatched") {
        await this.dispatchClickAt(point);
        try {
          await this.runLocatorOp(
            "retainedCheckedStateEquals",
            descriptor,
            { ...retainedArg, checked },
            { timeout: opts.timeout },
          );
        } catch (cause) {
          this.onInteraction?.({
            protocol: "cdp-interaction-outcome.v1",
            action,
            delivery,
            target: { selector: describeLocator(descriptor), ...target },
            effect: {
              status: "not-observed",
              locator: describeLocator(descriptor),
              state,
            },
          });
          throw cause;
        }
      }
      return await this.observeInteraction(
        action,
        descriptor,
        target,
        observation,
        delivery,
      );
    } finally {
      await this.runLocatorOp(
        "releaseRetainedElement",
        descriptor,
        { token: retainToken },
        { timeout: 0 },
      ).catch(() => undefined);
    }
  }

  private keyboardModifiers(): number {
    let modifiers = 0;
    for (const key of this.pressedModifiers)
      modifiers |= MODIFIER_BITS[key] ?? 0;
    return modifiers;
  }

  private keyDefinition(key: string): Record<string, unknown> {
    const normalized = normalizeKey(key);
    const def = KEY_DEFS[normalized];
    return def
      ? {
          key: def.key ?? normalized,
          // CDP's Windows code is portable; its native code is platform-specific.
          // Supplying this same number as a native code corrupts macOS input.
          windowsVirtualKeyCode: def.keyCode,
        }
      : {
          key: normalized,
          text: normalized.length === 1 ? normalized : undefined,
        };
  }

  private async keyDown(key: string): Promise<void> {
    const normalized = normalizeKey(key);
    if (MODIFIER_BITS[normalized]) this.pressedModifiers.add(normalized);
    await this.connection.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      ...this.keyDefinition(normalized),
      modifiers: this.keyboardModifiers(),
    });
  }

  private async keyUp(key: string): Promise<void> {
    const normalized = normalizeKey(key);
    await this.connection.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      ...this.keyDefinition(normalized),
      modifiers: this.keyboardModifiers(),
    });
    this.pressedModifiers.delete(normalized);
  }

  /** Dispatch a key or chord (for example "Enter" or "Control+A"). */
  async pressKey(key: string): Promise<void> {
    const parts = key.split("+").map(normalizeKey);
    const main = parts.pop();
    if (!main) throw new Error("keyboard.press requires a key");
    for (const modifier of parts) await this.keyDown(modifier);
    await this.keyDown(main);
    const def = KEY_DEFS[main];
    // Shift changes text; it does not make Enter/Space into non-text shortcuts.
    // Consult held modifiers too, including ones established by keyboard.down().
    const shortcutModifiers =
      this.keyboardModifiers() & ~MODIFIER_BITS["Shift"]!;
    const text =
      shortcutModifiers === 0
        ? (def?.text ?? (main.length === 1 ? main : undefined))
        : undefined;
    if (text) {
      await this.connection.send("Input.dispatchKeyEvent", {
        type: "char",
        text,
        key: this.keyDefinition(main)["key"],
        modifiers: this.keyboardModifiers(),
      });
    }
    await this.keyUp(main);
    for (const modifier of parts.reverse()) await this.keyUp(modifier);
    await this.afterAction();
  }

  /** Yield the worker turn after dispatch; locator postconditions observe effects. */
  private async afterAction(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // ---- Console ----------------------------------------------------------
  consoleEvents(): CdpConsoleEvent[] {
    return [...this.consoleBuffer];
  }
  clearConsoleEvents(): void {
    this.consoleBuffer.length = 0;
  }

  // ---- Screenshot -------------------------------------------------------
  async screenshot(options: CdpScreenshotOptions = {}): Promise<Uint8Array> {
    const supported = new Set(["type", "quality", "fullPage"]);
    const unsupported = Object.keys(options).filter(
      (key) => !supported.has(key),
    );
    if (unsupported.length > 0) {
      const pathHint = unsupported.includes("path")
        ? " CdpPage.screenshot returns Uint8Array; store it explicitly with @workspace/runtime blobstore.putBytes."
        : "";
      throw new TypeError(
        `Unsupported screenshot option${unsupported.length === 1 ? "" : "s"} ${unsupported
          .map((key) => JSON.stringify(key))
          .join(", ")}.${pathHint} Supported options: type, quality, fullPage.`,
      );
    }
    if (
      options.quality !== undefined &&
      (!Number.isInteger(options.quality) ||
        options.quality < 0 ||
        options.quality > 100)
    ) {
      throw new TypeError(
        `screenshot quality must be an integer from 0 to 100; received ${JSON.stringify(
          options.quality,
        )}`,
      );
    }
    if (options.quality !== undefined && options.type !== "jpeg") {
      throw new TypeError(
        'screenshot quality is supported only when type is "jpeg"',
      );
    }
    // Keep the public page API Playwright-shaped (`type`) while speaking the
    // Chrome DevTools Protocol shape (`format`) on the wire.
    const { type, fullPage, ...rest } = options;
    const params = {
      ...rest,
      ...(type ? { format: type } : {}),
      ...(fullPage ? { captureBeyondViewport: true } : {}),
    };
    const result = (await this.connection.send(
      "Page.captureScreenshot",
      params,
    )) as {
      data?: string;
    };
    if (!result.data)
      throw new Error("CDP screenshot did not return image data");
    return decodeBase64(result.data);
  }

  /** Disconnect this automation client. Target/panel lifecycle remains handle-owned. */
  async close(): Promise<void> {
    this.connection.close();
  }

  /** True after client close, bridge replacement, transport loss, or command timeout. */
  isClosed(): boolean {
    return this.connection.isClosed();
  }
}

class WorkerCdpLocator {
  constructor(
    protected readonly page: WorkerCdpPage,
    protected readonly descriptor: LocatorDescriptor,
  ) {}

  private extend(step: LocatorStep): WorkerCdpLocator {
    return new WorkerCdpLocator(this.page, {
      steps: [...this.descriptor.steps, step],
    });
  }

  /** Playwright-style description, e.g. `getByRole("button", { name: "Go" })`. */
  toString(): string {
    return describeLocator(this.descriptor);
  }

  contentFrame(): WorkerCdpFrameLocator {
    return new WorkerCdpFrameLocator(this.page, this.descriptor);
  }

  // ---- Scoped sub-locators / chaining -----------------------------------
  locator(selector: string): WorkerCdpLocator {
    return this.extend(compileLocatorSelector(selector));
  }
  getByRole(role: string, options: ByRoleOptions = {}): WorkerCdpLocator {
    return this.extend(roleLocatorStep(role, options));
  }
  getByText(text: TextMatcher, options: ByTextOptions = {}): WorkerCdpLocator {
    return this.extend({
      by: "text",
      value: serializeTextMatcher(text),
      exact: options.exact,
    });
  }
  getByLabel(text: TextMatcher, options: ByTextOptions = {}): WorkerCdpLocator {
    return this.extend({
      by: "label",
      value: serializeTextMatcher(text),
      exact: options.exact,
    });
  }
  getByPlaceholder(
    text: TextMatcher,
    options: ByTextOptions = {},
  ): WorkerCdpLocator {
    return this.extend({
      by: "placeholder",
      value: serializeTextMatcher(text),
      exact: options.exact,
    });
  }
  getByTestId(testId: string): WorkerCdpLocator {
    return this.extend({ by: "testid", value: testId });
  }
  getByAltText(
    text: TextMatcher,
    options: ByTextOptions = {},
  ): WorkerCdpLocator {
    return this.extend({
      by: "alt",
      value: serializeTextMatcher(text),
      exact: options.exact,
    });
  }
  getByTitle(text: TextMatcher, options: ByTextOptions = {}): WorkerCdpLocator {
    return this.extend({
      by: "title",
      value: serializeTextMatcher(text),
      exact: options.exact,
    });
  }
  filter(
    options: { hasText?: TextMatcher; hasTextExact?: boolean } = {},
  ): WorkerCdpLocator {
    return this.extend({
      filter: {
        hasText:
          options.hasText === undefined
            ? undefined
            : serializeTextMatcher(options.hasText),
        hasTextExact: options.hasTextExact,
      },
    });
  }
  nth(index: number): WorkerCdpLocator {
    return this.extend({ nth: index });
  }
  first(): WorkerCdpLocator {
    return this.nth(0);
  }
  last(): WorkerCdpLocator {
    return this.nth(-1);
  }
  async all(): Promise<WorkerCdpLocator[]> {
    const count = await this.count();
    const out: WorkerCdpLocator[] = [];
    for (let i = 0; i < count; i++) out.push(this.nth(i));
    return out;
  }

  // ---- Actions (auto-waiting) -------------------------------------------
  async click(opts: InteractionOptions = {}): Promise<CdpInteractionOutcome> {
    return this.page.clickDescriptor(this.descriptor, opts);
  }
  async dblclick(
    opts: InteractionOptions = {},
  ): Promise<CdpInteractionOutcome> {
    return this.page.clickDescriptor(this.descriptor, {
      ...opts,
      clickCount: 2,
    });
  }
  async hover(opts: ActionOptions = {}): Promise<void> {
    await this.page.hoverDescriptor(this.descriptor, opts);
  }
  async fill(value: string, opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp("fill", this.descriptor, { value }, opts);
  }
  async setInputFiles(
    files: CdpFilePayload | CdpFilePayload[],
    opts: ActionOptions = {},
  ): Promise<void> {
    const payload = (Array.isArray(files) ? files : [files]).map((file) => {
      if (
        !file ||
        typeof file.name !== "string" ||
        !file.name ||
        (file.mimeType !== undefined && typeof file.mimeType !== "string") ||
        !ArrayBuffer.isView(file.buffer) ||
        Object.prototype.toString.call(file.buffer) !== "[object Uint8Array]"
      )
        throw new TypeError(
          "setInputFiles expects {name, mimeType?, buffer: Uint8Array} payloads",
        );
      let binary = "";
      for (let offset = 0; offset < file.buffer.byteLength; offset += 8192)
        binary += String.fromCharCode(
          ...file.buffer.subarray(offset, offset + 8192),
        );
      return {
        name: file.name,
        mimeType: file.mimeType ?? "",
        base64: btoa(binary),
      };
    });
    await this.page.runLocatorOp(
      "setInputFiles",
      this.descriptor,
      { files: payload },
      opts,
    );
  }
  async type(text: string, opts: ActionOptions = {}): Promise<void> {
    const current = (await this.page.runLocatorOp(
      "inputValue",
      this.descriptor,
      null,
      opts,
    )) as string;
    await this.page.runLocatorOp(
      "fill",
      this.descriptor,
      { value: `${current ?? ""}${text}` },
      opts,
    );
  }
  async clear(opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp("clear", this.descriptor, null, opts);
  }
  async press(
    key: string,
    opts: InteractionOptions = {},
  ): Promise<CdpInteractionOutcome> {
    return this.page.pressDescriptor(this.descriptor, key, opts);
  }
  async check(opts: InteractionOptions = {}): Promise<CdpInteractionOutcome> {
    return this.page.setCheckedDescriptor(this.descriptor, true, opts);
  }
  async uncheck(opts: InteractionOptions = {}): Promise<CdpInteractionOutcome> {
    return this.page.setCheckedDescriptor(this.descriptor, false, opts);
  }
  async setChecked(
    checked: boolean,
    opts: InteractionOptions = {},
  ): Promise<CdpInteractionOutcome> {
    return this.page.setCheckedDescriptor(this.descriptor, checked, opts);
  }
  async selectOption(
    value: SelectOptionInput | SelectOptionInput[],
    opts: ActionOptions = {},
  ): Promise<string[]> {
    const values = Array.isArray(value) ? value : [value];
    for (const option of values) {
      if (typeof option === "string") continue;
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        throw new TypeError(
          "selectOption values must be strings or objects with value, label, or index",
        );
      }
      const keys = Object.keys(option);
      if (
        keys.length === 0 ||
        keys.some((key) => !["value", "label", "index"].includes(key))
      ) {
        throw new TypeError(
          "selectOption option objects may only contain value, label, or index",
        );
      }
      if (
        option.value === undefined &&
        option.label === undefined &&
        option.index === undefined
      ) {
        throw new TypeError(
          "selectOption option objects require value, label, or index",
        );
      }
      if (option.value !== undefined && typeof option.value !== "string") {
        throw new TypeError("selectOption option.value must be a string");
      }
      if (option.label !== undefined && typeof option.label !== "string") {
        throw new TypeError("selectOption option.label must be a string");
      }
      if (
        option.index !== undefined &&
        (!Number.isInteger(option.index) || option.index < 0)
      ) {
        throw new TypeError(
          "selectOption option.index must be a non-negative integer",
        );
      }
    }
    return (await this.page.runLocatorOp(
      "selectOption",
      this.descriptor,
      { values },
      opts,
    )) as string[];
  }
  async focus(opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp("focus", this.descriptor, null, opts);
  }
  async blur(opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp("blur", this.descriptor, null, opts);
  }
  async selectText(opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp("selectText", this.descriptor, null, opts);
  }
  async scrollIntoViewIfNeeded(opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp("scrollIntoView", this.descriptor, null, opts);
  }
  async dispatchEvent(type: string, opts: ActionOptions = {}): Promise<void> {
    await this.page.runLocatorOp(
      "dispatchEvent",
      this.descriptor,
      { type },
      opts,
    );
  }

  // ---- State / reads ----------------------------------------------------
  async waitFor(
    options: { state?: WaitState; timeout?: number } = {},
  ): Promise<void> {
    await this.page.runLocatorOp("waitFor", this.descriptor, null, {
      state: options.state ?? "visible",
      timeout: options.timeout,
    });
  }
  async count(): Promise<number> {
    return Number(
      (await this.page.runLocatorOp("count", this.descriptor, null)) ?? 0,
    );
  }
  async isVisible(): Promise<boolean> {
    return Boolean(
      await this.page.runLocatorOp("isVisible", this.descriptor, null),
    );
  }
  async isChecked(opts: ActionOptions = {}): Promise<boolean> {
    return Boolean(
      await this.page.runLocatorOp("isChecked", this.descriptor, null, opts),
    );
  }
  async isEnabled(opts: ActionOptions = {}): Promise<boolean> {
    return Boolean(
      await this.page.runLocatorOp("isEnabled", this.descriptor, null, opts),
    );
  }
  async isDisabled(opts: ActionOptions = {}): Promise<boolean> {
    return Boolean(
      await this.page.runLocatorOp("isDisabled", this.descriptor, null, opts),
    );
  }
  async isEditable(opts: ActionOptions = {}): Promise<boolean> {
    return Boolean(
      await this.page.runLocatorOp("isEditable", this.descriptor, null, opts),
    );
  }
  async getAttribute(
    name: string,
    opts: ActionOptions = {},
  ): Promise<string | null> {
    const v = await this.page.runLocatorOp(
      "getAttribute",
      this.descriptor,
      { name },
      opts,
    );
    return v == null ? null : String(v);
  }
  async inputValue(opts: ActionOptions = {}): Promise<string> {
    return String(
      (await this.page.runLocatorOp(
        "inputValue",
        this.descriptor,
        null,
        opts,
      )) ?? "",
    );
  }
  async innerText(opts: ActionOptions = {}): Promise<string> {
    return String(
      (await this.page.runLocatorOp(
        "innerText",
        this.descriptor,
        null,
        opts,
      )) ?? "",
    );
  }
  async textContent(): Promise<string | null> {
    const v = await this.page.runLocatorOp(
      "textContent",
      this.descriptor,
      null,
    );
    return v == null ? null : String(v);
  }
  async allInnerTexts(): Promise<string[]> {
    return (await this.page.runLocatorOp(
      "allInnerTexts",
      this.descriptor,
      null,
    )) as string[];
  }
  async allTextContents(): Promise<string[]> {
    return (await this.page.runLocatorOp(
      "allTextContents",
      this.descriptor,
      null,
    )) as string[];
  }
  async evaluate<Result, Arg = unknown>(
    pageFunction: (element: Element, arg: Arg) => Result | Promise<Result>,
    arg?: Arg,
  ): Promise<Result> {
    return (await this.page.runLocatorOp("evaluate", this.descriptor, {
      source: pageFunction.toString(),
      arg,
    })) as Result;
  }
  async evaluateAll<Result, Arg = unknown>(
    pageFunction: (elements: Element[], arg: Arg) => Result | Promise<Result>,
    arg?: Arg,
  ): Promise<Result> {
    return (await this.page.runLocatorOp("evaluateAll", this.descriptor, {
      source: pageFunction.toString(),
      arg,
    })) as Result;
  }
  async boundingBox(): Promise<BoundingBox | null> {
    return (await this.page.runLocatorOp(
      "boundingBox",
      this.descriptor,
      null,
    )) as BoundingBox | null;
  }
  async inspect(): Promise<CdpDomInspection> {
    const raw = (await this.page.runLocatorOp(
      "inspect",
      this.descriptor,
      null,
    )) as
      | (Omit<CdpDomInspection, "selector"> & { found: boolean })
      | { found: false };
    const selector = JSON.stringify(this.descriptor.steps);
    if (!raw.found) return { selector, found: false };
    return { selector, ...(raw as object) } as CdpDomInspection;
  }
}

/** Frame locators are lazy: every operation resolves the current iframe and document generation. */
export class WorkerCdpFrameLocator {
  private readonly page: WorkerCdpPage;
  constructor(parent: WorkerCdpPage, descriptor: LocatorDescriptor) {
    this.page = parent.framePage(descriptor);
  }
  locator(selector: string) {
    return this.page.locator(selector);
  }
  getByRole(role: string, options: ByRoleOptions = {}) {
    return this.page.getByRole(role, options);
  }
  getByText(text: TextMatcher, options: ByTextOptions = {}) {
    return this.page.getByText(text, options);
  }
  getByLabel(text: TextMatcher, options: ByTextOptions = {}) {
    return this.page.getByLabel(text, options);
  }
  getByPlaceholder(text: TextMatcher, options: ByTextOptions = {}) {
    return this.page.getByPlaceholder(text, options);
  }
  getByTestId(id: string) {
    return this.page.getByTestId(id);
  }
  getByAltText(text: TextMatcher, options: ByTextOptions = {}) {
    return this.page.getByAltText(text, options);
  }
  getByTitle(text: TextMatcher, options: ByTextOptions = {}) {
    return this.page.getByTitle(text, options);
  }
  frameLocator(selector: string) {
    return this.page.frameLocator(selector);
  }
  evaluate<Result, Arg = unknown>(
    fn: string | ((arg: Arg) => Result | Promise<Result>),
    arg?: Arg,
  ): Promise<Result> {
    return this.page.evaluate(fn, arg);
  }
}

/** Route DOM work to the frame's current world and input through its owning parent viewport. */
class FrameChannel implements FrameTransport {
  constructor(
    private readonly parent: WorkerCdpPage,
    private readonly descriptor: LocatorDescriptor,
  ) {}
  session(id: string): CdpSession {
    return this.parent.connection.session(id);
  }
  dialog(): CdpDialog | null {
    return this.parent.connection.dialog();
  }
  onDialog(handler: DialogHandler): () => void {
    return this.parent.connection.onDialog(handler);
  }
  on(method: string, listener: (params: unknown) => void): () => void {
    return this.parent.connection.on(method, listener);
  }
  onClosed(listener: (error: Error) => void): () => void {
    return this.parent.connection.onClosed(listener);
  }
  onDisconnect(listener: (error: Error) => void): () => void {
    return this.parent.connection.onDisconnect(listener);
  }
  isClosed(): boolean {
    return this.parent.connection.isClosed();
  }
  close(): void {
    /* A lazy frame view owns no independent target or transport. */
  }
  private async protocolChannel(): Promise<FrameTransport> {
    const frame = await this.parent.resolveFrame(this.descriptor);
    try {
      return (await this.parent.frames.resolve(frame.frameId)).channel;
    } finally {
      await this.parent.connection
        .send("Runtime.releaseObject", { objectId: frame.objectId })
        .catch(() => undefined);
    }
  }
  /** Box-model quads are relative to the native target's root, not to every nested frame. */
  private async forwardTargetPointer(
    source: FrameTransport,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const targetRoot = this.parent.frames.targetFrame(source);
    if (!targetRoot) return source.send("Input.dispatchMouseEvent", params);
    const frame = await this.parent.resolveFrame(this.descriptor);
    try {
      if (frame.frameId === targetRoot)
        return this.dispatchPointer(frame, source, params);
      if (this.parent.connection instanceof FrameChannel)
        return this.parent.connection.forwardTargetPointer(source, params);
      throw new Error("Input target is outside the locator's frame ancestry");
    } finally {
      await this.parent.connection
        .send("Runtime.releaseObject", { objectId: frame.objectId })
        .catch(() => undefined);
    }
  }
  private async dispatchPointer(
    frame: { frameId: string; objectId: string },
    channel: FrameTransport,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const model = (await this.parent.connection.send("DOM.getBoxModel", {
      objectId: frame.objectId,
    })) as { model: { content: number[] } };
    const context = await this.parent.frames.resolve(frame.frameId);
    const viewport = (await channel.send("Runtime.evaluate", {
      expression: "({width: innerWidth, height: innerHeight})",
      contextId: context.contextId,
      returnByValue: true,
    })) as { result: { value: { width: number; height: number } } };
    const { width, height } = viewport.result.value,
      q = model.model.content;
    const u = Number(params["x"]) / width,
      v = Number(params["y"]) / height;
    // Project the unit rectangle onto Chromium's content quad, including CSS perspective.
    const dx1 = q[2]! - q[4]!,
      dx2 = q[6]! - q[4]!;
    const dy1 = q[3]! - q[5]!,
      dy2 = q[7]! - q[5]!;
    const sx = q[0]! - q[2]! + q[4]! - q[6]!,
      sy = q[1]! - q[3]! + q[5]! - q[7]!;
    const determinant = dx1 * dy2 - dx2 * dy1;
    const g = sx === 0 && sy === 0 ? 0 : (sx * dy2 - dx2 * sy) / determinant;
    const h = sx === 0 && sy === 0 ? 0 : (dx1 * sy - sx * dy1) / determinant;
    const divisor = g * u + h * v + 1;
    const x =
      ((q[2]! - q[0]! + g * q[2]!) * u +
        (q[6]! - q[0]! + h * q[6]!) * v +
        q[0]!) /
      divisor;
    const y =
      ((q[3]! - q[1]! + g * q[3]!) * u +
        (q[7]! - q[1]! + h * q[7]!) * v +
        q[1]!) /
      divisor;
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error("Frame content quad is degenerate");
    const parentChannel = this.parent.connection;
    if (parentChannel instanceof FrameChannel)
      return parentChannel.forwardTargetPointer(
        await parentChannel.protocolChannel(),
        { ...params, x, y },
      );
    return parentChannel.send("Input.dispatchMouseEvent", { ...params, x, y });
  }
  async send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const frame = await this.parent.resolveFrame(this.descriptor);
    try {
      const context = await this.parent.frames.resolve(frame.frameId);
      if (method === "Runtime.evaluate")
        return context.channel.send(method, {
          ...params,
          contextId: context.contextId,
        });
      if (method === "Input.dispatchMouseEvent")
        return this.dispatchPointer(frame, context.channel, params!);
      return context.channel.send(method, params);
    } finally {
      await this.parent.connection
        .send("Runtime.releaseObject", { objectId: frame.objectId })
        .catch(() => undefined);
    }
  }
}

class WorkerCdpElementHandle extends WorkerCdpLocator {}

class WorkerBrowser {
  constructor(
    private readonly page: WorkerCdpPage,
    private readonly connection: CdpConnection,
  ) {}

  contexts(): Array<{ pages(): WorkerCdpPage[] }> {
    return [{ pages: () => [this.page] }];
  }

  async close(): Promise<void> {
    this.connection.close();
  }
}

export const BrowserImpl = {
  async connect(
    wsEndpoint: string,
    options: {
      transportOptions?: { authToken?: string };
      /** Hosted EvalDO runtimes must use the egress-aware fetch upgrade. */
      preferFetchUpgrade?: boolean;
      /** Cancels connection acquisition; the connected browser owns its lifetime. */
      signal?: AbortSignal;
      /** Current invocation owner, resolved anew for retained page handles. */
      operationSignal?: () => AbortSignal | undefined;
      /** Observe completed input outcomes independently of caller return projections. */
      onInteraction?: (outcome: CdpInteractionOutcome) => void;
      /** Immutable provenance supplied by a generation-fenced panel session. */
      inspectionIdentity?: CdpInspectionIdentity;
      browserOperation?: BrowserOperation;
    } = {},
  ): Promise<WorkerBrowser> {
    const connection = await CdpConnection.connect(
      wsEndpoint,
      options.transportOptions?.authToken,
      options.preferFetchUpgrade,
      {
        signal: options.signal ?? options.operationSignal?.(),
        operationSignal: options.operationSignal,
      },
    );
    const page = new WorkerCdpPage(
      connection,
      options.onInteraction,
      options.inspectionIdentity
        ? Object.freeze({ ...options.inspectionIdentity })
        : undefined,
      undefined,
      options.browserOperation,
    );
    try {
      await page.initialize();
      return new WorkerBrowser(page, connection);
    } catch (error) {
      connection.close();
      throw error;
    }
  },
};

export type {
  WorkerCdpPage,
  WorkerCdpLocator,
  WorkerCdpElementHandle,
  WorkerBrowser,
};
