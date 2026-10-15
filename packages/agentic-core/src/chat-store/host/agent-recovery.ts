/**
 * Installed-agent recovery runner.
 *
 * One attempt per trigger, never a timer: the host starts an attempt when its
 * inputs change and whenever something that can make a missing agent
 * recoverable happens (start, a workspace review decided, workspace config or
 * unit set changed, a participant left the channel, an explicit Retry). Each
 * attempt owns an AbortController generation; a newer attempt, a replaced task
 * or disposal aborts the older one, and a superseded attempt never publishes.
 *
 * A failed attempt is a visible terminal state (`failed`, with a user-facing
 * error and Retry) until the next trigger starts a fresh attempt.
 */
import { userFacingError, type UserFacingError } from "../store.js";

export type AgentRecoveryStatus = "idle" | "recovering" | "failed";

export interface AgentRecoveryState {
  status: AgentRecoveryStatus;
  /** Why the last attempt failed (user-facing, with the technical detail). */
  error: UserFacingError | null;
  /** Handles of the installed agents being (or that failed to be) reconnected. */
  missing: string[];
  /** Attempts made for the current inputs (1 for the first). */
  attempt: number;
}

/** Progress a task reports while it runs. */
export interface AgentRecoveryProgress {
  /** Handles found missing from the channel and being reconnected. */
  missing(handles: string[]): void;
}

export type AgentRecoveryTask = (
  signal: AbortSignal,
  progress: AgentRecoveryProgress
) => Promise<void>;

export const IDLE_RECOVERY: AgentRecoveryState = {
  status: "idle",
  error: null,
  missing: [],
  attempt: 0,
};

/** The user-facing failure of an attempt to reconnect `missing` agents. */
export function recoveryFailure(missing: string[], cause: unknown): UserFacingError {
  const who =
    missing.length === 0
      ? "Your agent"
      : missing.length === 1
        ? `@${missing[0]}`
        : `${missing.length} agents`;
  return userFacingError(
    `${who} didn't reconnect to this conversation`,
    "Your messages are safe. Retry now; if it keeps failing, check that the agent's worker builds and that any pending approval is granted.",
    cause
  );
}

export class AgentRecoveryRunner {
  #generation: AbortController | null = null;
  #task: AgentRecoveryTask | null = null;
  #state: AgentRecoveryState = IDLE_RECOVERY;

  constructor(private readonly onState: (state: AgentRecoveryState) => void) {}

  get state(): AgentRecoveryState {
    return this.#state;
  }

  /** Replace the recovery task (null: nothing to recover) and attempt it. */
  run(task: AgentRecoveryTask | null): void {
    this.#task = task;
    this.#publish(IDLE_RECOVERY);
    this.#attempt();
  }

  /**
   * Attempt again for the current task: an explicit Retry, or an event that
   * may have made a missing agent recoverable. A no-op while nothing is
   * installed; an attempt in flight is superseded.
   */
  trigger(): void {
    this.#attempt();
  }

  dispose(): void {
    this.#generation?.abort(new Error("Agent recovery disposed"));
    this.#generation = null;
    this.#task = null;
  }

  #publish(state: AgentRecoveryState): void {
    const current = this.#state;
    if (
      state.status === current.status &&
      state.error === current.error &&
      state.attempt === current.attempt &&
      state.missing.join("\0") === current.missing.join("\0")
    )
      return;
    this.#state = state;
    this.onState(state);
  }

  #attempt(): void {
    this.#generation?.abort(new Error("Agent recovery superseded"));
    this.#generation = null;
    const task = this.#task;
    if (!task) {
      this.#publish(IDLE_RECOVERY);
      return;
    }
    const controller = new AbortController();
    this.#generation = controller;
    const { signal } = controller;
    const attempt = this.#state.attempt + 1;
    let missing = this.#state.missing;
    this.#publish({ status: "recovering", error: null, missing, attempt });
    const progress: AgentRecoveryProgress = {
      missing: (handles) => {
        if (signal.aborted) return;
        missing = handles;
        this.#publish({ status: "recovering", error: null, missing, attempt });
      },
    };
    void task(signal, progress).then(
      () => {
        if (!signal.aborted) this.#publish({ status: "idle", error: null, missing: [], attempt });
      },
      (cause: unknown) => {
        if (signal.aborted) return;
        console.warn("[ChatHost] Agent subscription recovery failed:", cause);
        this.#publish({ status: "failed", error: recoveryFailure(missing, cause), missing, attempt });
      }
    );
  }
}
