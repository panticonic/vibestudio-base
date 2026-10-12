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
    "status" | "onStatusChange"
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
  const off = connection.onStatusChange((status) => {
    const observed = ++revision;
    if (status !== "connected") {
      callbacks.invalidate();
      const request = callbacks.current();
      if (request)
        joining = request.cancel(
          new Error("Model discovery connection closed"),
        );
      void joining.catch((error: unknown) => {
        if (!disposed) callbacks.failure(error);
      });
      return;
    }
    const refresh = () => {
      if (
        !disposed &&
        revision === observed &&
        connection.status() === "connected"
      )
        callbacks.reconnect();
    };
    void joining.then(refresh, (error: unknown) => {
      if (!disposed) callbacks.failure(error);
      refresh(); // the actual new connection permits a fresh read after the old flight joined
    });
  });
  return async () => {
    disposed = true;
    revision += 1;
    off();
    const request = callbacks.current();
    await (request?.cancel(new Error("Chat panel closed")) ?? joining);
  };
}
