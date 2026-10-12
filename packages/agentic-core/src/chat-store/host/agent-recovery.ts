/**
 * Installed-agent recovery attempt loop.
 *
 * Each `run()` owns one recovery generation through an AbortController;
 * replacing it (new inputs, an explicit retry, disposal) aborts both the
 * in-flight attempt and its backoff, and a superseded generation can never
 * publish a status.
 *
 * EXISTING PRODUCT BEHAVIOUR, kept as-is: a failed attempt is retried up to
 * `AGENT_RECOVERY_MAX_ATTEMPTS` times with a fixed pause, after which the
 * failure is terminal and surfaced (with an explicit Retry). This is a
 * time-based re-poll: recovery right after a cold start races worker builds
 * and channel activation, which publish no event the host could wait on.
 */
import { asError } from "../store.js";

export const AGENT_RECOVERY_MAX_ATTEMPTS = 60;
export const AGENT_RECOVERY_RETRY_DELAY_MS = 1_000;

export type AgentRecoveryStatus = "idle" | "recovering" | "failed";

export interface AgentRecoveryState {
  status: AgentRecoveryStatus;
  error: string | null;
}

export type AgentRecoveryTask = (signal: AbortSignal) => Promise<void>;

export class AgentRecoveryLoop {
  #generation: AbortController | null = null;
  #task: AgentRecoveryTask | null = null;
  #state: AgentRecoveryState = { status: "idle", error: null };

  constructor(
    private readonly hooks: {
      onState: (state: AgentRecoveryState) => void;
      onFailure: (error: Error) => void;
    },
    private readonly options: { maxAttempts?: number; retryDelayMs?: number } = {}
  ) {}

  get state(): AgentRecoveryState {
    return this.#state;
  }

  /** Replace the recovery task (null: nothing to recover) and start it. */
  run(task: AgentRecoveryTask | null): void {
    this.#task = task;
    this.#start();
  }

  /** Start a fresh generation of the current task (explicit user retry). */
  retry(): void {
    this.#start();
  }

  dispose(): void {
    this.#generation?.abort(new Error("Agent recovery disposed"));
    this.#generation = null;
    this.#task = null;
  }

  #publish(state: AgentRecoveryState): void {
    if (state.status === this.#state.status && state.error === this.#state.error) return;
    this.#state = state;
    this.hooks.onState(state);
  }

  #start(): void {
    this.#generation?.abort(new Error("Agent recovery superseded"));
    this.#generation = null;
    const task = this.#task;
    if (!task) {
      this.#publish({ status: "idle", error: null });
      return;
    }
    const controller = new AbortController();
    this.#generation = controller;
    const { signal } = controller;
    const maxAttempts = this.options.maxAttempts ?? AGENT_RECOVERY_MAX_ATTEMPTS;
    const retryDelayMs = this.options.retryDelayMs ?? AGENT_RECOVERY_RETRY_DELAY_MS;
    this.#publish({ status: "recovering", error: null });
    void (async () => {
      for (let count = 1; !signal.aborted; count += 1) {
        try {
          await task(signal);
          if (!signal.aborted) this.#publish({ status: "idle", error: null });
          return;
        } catch (cause) {
          if (signal.aborted) return;
          if (count === maxAttempts) {
            const failure = asError(cause);
            this.#publish({ status: "failed", error: failure.message });
            this.hooks.onFailure(failure);
            return;
          }
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, retryDelayMs);
            signal.addEventListener("abort", finish, { once: true });
          });
        }
      }
    })();
  }
}
