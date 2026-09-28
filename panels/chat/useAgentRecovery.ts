import { useCallback, useEffect, useState } from "react";

const MAX_ATTEMPTS = 60;
const RETRY_DELAY_MS = 1_000;

/** Each effect owns one recovery; replacing it cancels both work and backoff. */
export function useAgentRecovery(
  recover: ((signal: AbortSignal) => Promise<void>) | null,
  onFailure: (error: Error) => void,
) {
  const [status, setStatus] = useState<"idle" | "recovering" | "failed">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    setError(null);
    if (!recover) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    setStatus("recovering");
    void (async () => {
      for (let count = 1; !signal.aborted; count += 1) {
        try {
          await recover(signal);
          if (!signal.aborted) setStatus("idle");
          return;
        } catch (cause) {
          if (signal.aborted) return;
          if (count === MAX_ATTEMPTS) {
            const failure =
              cause instanceof Error ? cause : new Error(String(cause));
            setError(failure.message);
            setStatus("failed");
            onFailure(failure);
            return;
          }
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, RETRY_DELAY_MS);
            signal.addEventListener("abort", finish, { once: true });
          });
        }
      }
    })();
    return () => controller.abort();
  }, [recover, onFailure, attempt]);

  return { status, error, retry };
}
