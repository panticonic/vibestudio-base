import { useSyncExternalStore, type ReactElement } from "react";
import {
  connectWorkspace,
  disconnectWorkspace,
  workspaceConnection,
} from "@workspace/runtime";

const getStatus = () => workspaceConnection.status;
const getError = () => workspaceConnection.error;
const serverStatus = () => "unavailable" as const;
const serverError = () => null;

/** A connection control, not an approval surface. Unmounting does not disconnect. */
export function WorkspaceConnection({
  className,
}: {
  className?: string;
}): ReactElement {
  const status = useSyncExternalStore(
    workspaceConnection.subscribe,
    getStatus,
    serverStatus,
  );
  const error = useSyncExternalStore(
    workspaceConnection.subscribe,
    getError,
    serverError,
  );
  const installed = workspaceConnection.kind === "installed";
  const message = {
    unavailable: "Open this page in a Vibestudio browser panel to connect.",
    disconnected:
      "Not connected. Connect to the workspace where this page is open. Capability requests are approved separately.",
    connecting: "Review the connection request in Vibestudio.",
    connected: installed
      ? "Running inside your workspace."
      : "Connected to this workspace. Capability requests are approved separately.",
    disconnecting: "Ending this page’s workspace connection…",
  }[status];
  return (
    <div
      className={["vibestudio-workspace-connection", className]
        .filter(Boolean)
        .join(" ")}
      data-state={status}
    >
      {status !== "unavailable" && !installed && (
        <button
          type="button"
          disabled={status === "connecting" || status === "disconnecting"}
          onClick={() => {
            // Preserve trusted user activation: call directly, never from an effect.
            const request = workspaceConnection.connected
              ? disconnectWorkspace()
              : connectWorkspace();
            void request.catch(() => {
              /* Runtime state exposes the failure to all consumers. */
            });
          }}
        >
          {status === "connecting"
            ? "Waiting for approval…"
            : status === "disconnecting"
              ? "Disconnecting…"
              : status === "connected"
                ? "Disconnect"
                : "Connect to workspace"}
        </button>
      )}
      <p role="status" aria-live="polite">
        {error ?? message}
      </p>
    </div>
  );
}
