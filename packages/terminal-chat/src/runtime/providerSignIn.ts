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

export type SignInState =
  | { phase: "idle" }
  | { phase: "starting"; providerId: string; label: string }
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
  | { phase: "error"; providerId: string; label: string; title: string; message: string };

interface OAuthLoopback {
  transactionId: string;
  redirectUri: string;
  state: string;
}

const EXTERNAL_OPEN_POLICY = {
  kind: "closed",
  reason: "Delivered only to the terminal chat that started the sign-in.",
} as const;

export class ProviderSignIn implements ReadableStore<SignInState> {
  readonly #rpc: ChatRpc;
  readonly #afterConnected: () => void;
  readonly #cell = new ValueStore<SignInState>({ phase: "idle" });
  #abort: AbortController | null = null;
  #loopback: OAuthLoopback | null = null;

  constructor(rpc: ChatRpc, options: { afterConnected: () => void }) {
    this.#rpc = rpc;
    this.#afterConnected = options.afterConnected;
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
      const known = listProviderConnectPresets().map((p) => p.providerId).join(", ");
      return `There is no provider called "${providerId}". Known providers: ${known}.`;
    }
    const flow = getProviderConnectMethod(providerId)?.flow.type;
    if (flow === "api-key") {
      return `${modelProviderLabel(providerId)} uses an API key, which is entered in model settings in the desktop app (keys never pass through chat).`;
    }
    return null;
  }

  async connect(providerId: string): Promise<boolean> {
    this.cancel();
    const label = modelProviderLabel(providerId);
    const unsupported = ProviderSignIn.unsupportedReason(providerId);
    if (unsupported) {
      this.#cell.set({ phase: "error", providerId, label, title: `Can't connect ${label} here`, message: unsupported });
      return false;
    }
    const request = toCredentialConnectRequest(providerId, { browser: "external" });
    if (!request) {
      this.#cell.set({ phase: "error", providerId, label, title: `Can't connect ${label}`, message: "This provider has no sign-in method this client supports. Use model settings in the desktop app." });
      return false;
    }
    const abort = new AbortController();
    this.#abort = abort;
    this.#loopback = null;
    this.#cell.set({ phase: "starting", providerId, label });
    // The server routes the browser handoff to this exact connection, so the
    // subscription must be live before connect starts.
    const off = this.#rpc.on(
      "external-open:open",
      (event) => {
        if (abort.signal.aborted) return;
        const payload = event.payload as { url?: unknown; oauthLoopback?: OAuthLoopback } | null;
        if (!payload || typeof payload.url !== "string") return;
        this.#loopback = payload.oauthLoopback ?? null;
        this.#cell.set({
          phase: "waiting",
          providerId,
          label,
          url: payload.url,
          callbackOrigin: payload.oauthLoopback ? originOf(payload.oauthLoopback.redirectUri) : null,
          pasteError: null,
        });
      },
      EXTERNAL_OPEN_POLICY
    );
    try {
      await this.#rpc.call("main", mainRpcMethods["credentials.connect"], [request], { signal: abort.signal });
      if (abort.signal.aborted) return false;
      this.#cell.set({ phase: "done", providerId, label });
      this.#afterConnected();
      return true;
    } catch (error) {
      if (abort.signal.aborted) return false;
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
      if (this.#abort === abort) this.#abort = null;
    }
  }

  /** Complete the sign-in with the callback address the person pasted. */
  async paste(text: string): Promise<void> {
    const state = this.getSnapshot();
    const loopback = this.#loopback;
    if (state.phase !== "waiting" || !loopback) return;
    let url: URL;
    try {
      url = new URL(text.trim());
    } catch {
      this.#cell.set({ ...state, pasteError: "That is not a web address. Copy the whole address from the browser's address bar." });
      return;
    }
    const callbackState = url.searchParams.get("state") ?? undefined;
    if (callbackState !== loopback.state) {
      this.#cell.set({ ...state, pasteError: "That address belongs to a different sign-in. Paste the address from the sign-in you just finished." });
      return;
    }
    this.#cell.set({ phase: "completing", providerId: state.providerId, label: state.label });
    try {
      await this.#rpc.call("main", mainRpcMethods["credentials.forwardOAuthCallback"], [
        { transactionId: loopback.transactionId, url: url.toString(), ...(callbackState ? { state: callbackState } : {}) },
      ]);
    } catch (error) {
      this.#cell.set({ phase: "error", providerId: state.providerId, label: state.label, title: `Connecting ${state.label} failed`, message: `${errorMessage(error)} Try /connect ${state.providerId} again.` });
      this.cancel();
    }
  }

  /** Stop waiting; the server transaction is cancelled. */
  cancel(): void {
    const abort = this.#abort;
    const loopback = this.#loopback;
    this.#abort = null;
    this.#loopback = null;
    if (abort) {
      abort.abort();
      if (loopback) {
        void this.#rpc
          .call("main", mainRpcMethods["credentials.cancelOAuth"], [{ transactionId: loopback.transactionId }])
          .catch(() => undefined);
      }
    }
    const state = this.getSnapshot();
    if (state.phase === "starting" || state.phase === "waiting" || state.phase === "completing") this.#cell.set({ phase: "idle" });
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
