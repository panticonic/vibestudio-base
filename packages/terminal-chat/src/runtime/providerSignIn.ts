/**
 * Provider sign-in from the terminal: the CLI's manual mode
 * (`vibestudio model connect --manual`) as a store. The server runs the
 * OAuth transaction and hands this connection the authorize URL; the person
 * opens it wherever their browser is (the URL is an OSC 8 link), and pastes
 * the callback address back because nothing listens on their machine's
 * loopback redirect. PKCE, token exchange and storage stay server-side.
 */
import {
  getProviderConnectMethod,
  getProviderConnectPreset,
  listProviderConnectPresets,
  modelProviderLabel,
  toCredentialConnectRequest,
} from "@vibestudio/shared/providerConnect";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { errorMessage, type ReadableStore } from "@workspace/agentic-core/chat-store";
import { ValueStore } from "./valueStore.js";
import type { ChatRpc } from "./bootstrap.js";
import { isRpcAbortedBy } from "@vibestudio/rpc";

export type SignInState =
  | { phase: "idle" }
  | { phase: "starting"; providerId: string; label: string }
  | { phase: "protected-input"; providerId: string; label: string }
  /** Waiting for the person: open `url`, then (with a loopback redirect) paste the callback. */
  | {
      phase: "waiting";
      providerId: string;
      label: string;
      url: string;
      /** Origin the callback URL starts with; null when no paste is needed. */
      callbackOrigin: string | null;
      pasteError: string | null;
    }
  | { phase: "completing"; providerId: string; label: string }
  | { phase: "done"; providerId: string; label: string }
  | {
      phase: "error";
      providerId: string;
      label: string;
      title: string;
      message: string;
    };

interface OAuthLoopback {
  transactionId: string;
  redirectUri: string;
  state: string;
}

interface SignInOperation {
  abort: AbortController;
  loopback: OAuthLoopback | null;
  tasks: Set<Promise<unknown>>;
  admission: Promise<void>;
  closing: Promise<void> | null;
}

const EXTERNAL_OPEN_POLICY = {
  kind: "closed",
  reason: "Delivered only to the terminal chat that started the sign-in.",
} as const;

export class ProviderSignIn implements ReadableStore<SignInState> {
  readonly #rpc: ChatRpc;
  readonly #afterConnected: () => void;
  readonly #ownerSignal: (() => AbortSignal | undefined) | undefined;
  readonly #cell = new ValueStore<SignInState>({ phase: "idle" });
  #operation: SignInOperation | null = null;

  #request<T>(operation: SignInOperation, promise: Promise<T>): Promise<T> {
    operation.tasks.add(promise);
    void promise.then(
      () => operation.tasks.delete(promise),
      () => operation.tasks.delete(promise)
    );
    return promise;
  }

  #retire(operation: SignInOperation | null): Promise<void> {
    if (!operation) return Promise.resolve();
    if (operation.closing) return operation.closing;
    operation.abort.abort(new Error("Provider sign-in cancelled"));
    const cancel = operation.loopback
      ? this.#rpc.call("main", mainRpcMethods["credentials.cancelOAuth"], [
          { transactionId: operation.loopback.transactionId },
        ])
      : Promise.resolve();
    operation.closing = Promise.allSettled([operation.admission, ...operation.tasks, cancel]).then(
      (results) => {
        const errors = results.flatMap((result) =>
          result.status === "rejected" &&
          !isRpcAbortedBy(result.reason, operation.abort.signal.reason)
            ? [result.reason]
            : []
        );
        if (errors.length) throw new AggregateError(errors, "Provider sign-in cleanup failed");
      }
    );
    return operation.closing;
  }

  constructor(
    rpc: ChatRpc,
    options: {
      afterConnected: () => void;
      ownerSignal?: () => AbortSignal | undefined;
    }
  ) {
    this.#rpc = rpc;
    this.#afterConnected = options.afterConnected;
    this.#ownerSignal = options.ownerSignal;
  }

  readonly getSnapshot = (): SignInState => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  /** Providers that can be connected from here, for completion and pickers. */
  static providers(): Array<{ id: string; label: string }> {
    return listProviderConnectPresets().map((preset) => ({
      id: preset.providerId,
      label: modelProviderLabel(preset.providerId),
    }));
  }

  /**
   * Why `providerId` cannot be connected from a terminal, or null when it can.
   * The sentence names the alternative.
   */
  static unsupportedReason(providerId: string): string | null {
    const preset = getProviderConnectPreset(providerId);
    if (!preset) {
      const known = listProviderConnectPresets()
        .map((p) => p.providerId)
        .join(", ");
      return `There is no provider called "${providerId}". Known providers: ${known}.`;
    }
    return null;
  }

  async connect(providerId: string): Promise<boolean> {
    const preceding = this.#operation;
    const operation: SignInOperation = {
      abort: new AbortController(),
      loopback: null,
      tasks: new Set(),
      admission: Promise.resolve(),
      closing: null,
    };
    this.#operation = operation;
    operation.admission = this.#retire(preceding);
    if (preceding) await operation.admission;
    if (operation.abort.signal.aborted || this.#operation !== operation) return false;
    const label = modelProviderLabel(providerId);
    const unsupported = ProviderSignIn.unsupportedReason(providerId);
    if (unsupported) {
      this.#cell.set({
        phase: "error",
        providerId,
        label,
        title: `Can't connect ${label} here`,
        message: unsupported,
      });
      return false;
    }
    const request = toCredentialConnectRequest(providerId, {
      browser: "external",
    });
    if (!request) {
      this.#cell.set({
        phase: "error",
        providerId,
        label,
        title: `Can't connect ${label}`,
        message:
          "This provider has no sign-in method this client supports. Use model settings in the desktop app.",
      });
      return false;
    }
    const abort = operation.abort;
    const owner = this.#ownerSignal?.();
    const onOwnerAbort = () => {
      abort.abort(owner?.reason);
      if (this.#operation === operation) this.#cell.set({ phase: "idle" });
    };
    owner?.addEventListener("abort", onOwnerAbort, { once: true });
    if (owner?.aborted) onOwnerAbort();
    const protectedInput = getProviderConnectMethod(providerId)?.flow.type === "api-key";
    this.#cell.set({
      phase: protectedInput ? "protected-input" : "starting",
      providerId,
      label,
    });
    if (abort.signal.aborted || this.#operation !== operation) {
      owner?.removeEventListener("abort", onOwnerAbort);
      return false;
    }
    // The server routes the browser handoff to this exact connection, so the
    // subscription must be live before connect starts.
    const off = this.#rpc.on(
      "external-open:open",
      (event) => {
        if (abort.signal.aborted) return;
        const payload = event.payload as {
          url?: unknown;
          oauthLoopback?: OAuthLoopback;
        } | null;
        if (!payload || typeof payload.url !== "string") return;
        operation.loopback = payload.oauthLoopback ?? null;
        this.#cell.set({
          phase: "waiting",
          providerId,
          label,
          url: payload.url,
          callbackOrigin: payload.oauthLoopback
            ? originOf(payload.oauthLoopback.redirectUri)
            : null,
          pasteError: null,
        });
      },
      EXTERNAL_OPEN_POLICY
    );
    try {
      await this.#request(
        operation,
        this.#rpc.call("main", mainRpcMethods["credentials.connect"], [request], {
          signal: abort.signal,
        })
      );
      if (abort.signal.aborted || this.#operation !== operation) return false;
      operation.loopback = null;
      this.#cell.set({ phase: "done", providerId, label });
      this.#afterConnected();
      return true;
    } catch (error) {
      if (isRpcAbortedBy(error, abort.signal.reason)) return false;
      if (this.#operation !== operation) throw error;
      operation.loopback = null;
      this.#cell.set({
        phase: "error",
        providerId,
        label,
        title: `Connecting ${label} failed`,
        message: `${errorMessage(error)} Try /connect ${providerId} again.`,
      });
      return false;
    } finally {
      off();
      owner?.removeEventListener("abort", onOwnerAbort);
    }
  }

  /** Complete the sign-in with the callback address the person pasted. */
  async paste(text: string): Promise<void> {
    const state = this.getSnapshot();
    const operation = this.#operation;
    const loopback = operation?.loopback;
    if (state.phase !== "waiting" || !loopback || !operation) return;
    let url: URL;
    try {
      url = new URL(text.trim());
    } catch {
      this.#cell.set({
        ...state,
        pasteError:
          "That is not a web address. Copy the whole address from the browser's address bar.",
      });
      return;
    }
    const callbackState = url.searchParams.get("state") ?? undefined;
    if (callbackState !== loopback.state) {
      this.#cell.set({
        ...state,
        pasteError:
          "That address belongs to a different sign-in. Paste the address from the sign-in you just finished.",
      });
      return;
    }
    this.#cell.set({
      phase: "completing",
      providerId: state.providerId,
      label: state.label,
    });
    try {
      await this.#request(
        operation,
        this.#rpc.call(
          "main",
          mainRpcMethods["credentials.forwardOAuthCallback"],
          [
            {
              transactionId: loopback.transactionId,
              url: url.toString(),
              ...(callbackState ? { state: callbackState } : {}),
            },
          ],
          { signal: operation.abort.signal }
        )
      );
    } catch (error) {
      if (isRpcAbortedBy(error, operation.abort.signal.reason)) return;
      if (this.#operation !== operation) throw error;
      this.#cell.set({
        phase: "error",
        providerId: state.providerId,
        label: state.label,
        title: `Connecting ${state.label} failed`,
        message: `${errorMessage(error)} Try /connect ${state.providerId} again.`,
      });
      await this.cancel();
    }
  }

  /** Stop waiting; the server transaction is cancelled. */
  cancel(): Promise<void> {
    const operation = this.#operation;
    this.#operation = null;
    const state = this.getSnapshot();
    if (
      state.phase === "starting" ||
      state.phase === "protected-input" ||
      state.phase === "waiting" ||
      state.phase === "completing"
    )
      this.#cell.set({ phase: "idle" });
    return this.#retire(operation);
  }

  /** Forget a finished or failed sign-in (the card closes). */
  dismiss(): void {
    const phase = this.getSnapshot().phase;
    if (phase === "done" || phase === "error") this.#cell.set({ phase: "idle" });
  }
}

function originOf(uri: string): string {
  try {
    return new URL(uri).origin;
  } catch {
    return uri;
  }
}
