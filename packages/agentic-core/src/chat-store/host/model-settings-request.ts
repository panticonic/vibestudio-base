import { isRpcAborted } from "@vibestudio/rpc";

/** One existing discovery flight; cancellation joins it and never chooses a model. */
export function ownModelSettingsRequest<T>(
  read: (signal: AbortSignal) => Promise<T>,
): {
  promise: Promise<T>;
  cancel(reason: Error): Promise<void>;
} {
  const controller = new AbortController();
  let settled = false;
  const promise = Promise.resolve()
    .then(() => {
      controller.signal.throwIfAborted();
      return read(controller.signal);
    })
    .then((result) => {
      controller.signal.throwIfAborted();
      return result;
    })
    .then(
      (result) => {
        settled = true;
        return result;
      },
      (error: unknown) => {
        settled = true;
        throw error;
      },
    );
  let closing: Promise<void> | null = null;
  return {
    promise,
    cancel(reason) {
      if (closing) return closing;
      if (settled) return Promise.resolve();
      controller.abort(reason);
      closing = promise.then(
        () => undefined,
        (error: unknown) => {
          if (error === controller.signal.reason || isRpcAborted(error)) return;
          throw error;
        },
      );
      return closing;
    },
  };
}

/** Bind that existing flight to actual transport replacement and panel closure. */
export function ownModelSettingsConnection(
  connection: Pick<
    import("@vibestudio/rpc").RpcClient,
    "status" | "onStatusChange" | "onRecovery"
  >,
  callbacks: {
    current(): { cancel(reason: Error): Promise<void> } | null;
    invalidate(): void;
    reconnect(): void;
    failure(error: unknown): void;
  },
): () => Promise<void> {
  let disposed = false;
  let revision = 0;
  let joining = Promise.resolve();
  const retireCurrent = (reason: Error): void => {
    callbacks.invalidate();
    const request = callbacks.current();
    if (request) joining = request.cancel(reason);
    void joining.catch((error: unknown) => {
      if (!disposed) callbacks.failure(error);
    });
  };
  const refreshAfterJoin = (observed: number): void => {
    const refresh = () => {
      if (
        !disposed &&
        revision === observed &&
        connection.status() === "connected"
      )
        callbacks.reconnect();
    };
    // retireCurrent owns reporting the joined request's original failure.
    // Once that request settles, either outcome permits the fresh generation.
    void joining.then(refresh, refresh);
  };
  const offStatus = connection.onStatusChange((status) => {
    const observed = ++revision;
    if (status !== "connected") {
      retireCurrent(new Error("Model discovery connection closed"));
      return;
    }
    // onRecovery reports future recovery generations but intentionally does
    // not replay the initial connection. This path therefore also owns an
    // initial/status-only transition to connected. A recovery delivered in
    // the same turn advances revision and suppresses this scheduled refresh.
    refreshAfterJoin(observed);
  });
  const offRecovery = connection.onRecovery(() => {
    const observed = ++revision;
    retireCurrent(new Error("Model discovery transport generation retired"));
    refreshAfterJoin(observed);
  });
  return async () => {
    disposed = true;
    revision += 1;
    offStatus();
    offRecovery();
    const request = callbacks.current();
    await (request?.cancel(new Error("Chat panel closed")) ?? joining);
  };
}
