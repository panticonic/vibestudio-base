// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConnection } from "./WorkspaceConnection.js";

const { connection, listeners, connect, disconnect } = vi.hoisted(() => ({
  connection: {
    status: "disconnected",
    error: null as string | null,
    kind: "website",
    connected: false,
  },
  listeners: new Set<() => void>(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  workspaceConnection: {
    get status() {
      return connection.status;
    },
    get error() {
      return connection.error;
    },
    get kind() {
      return connection.kind;
    },
    get connected() {
      return connection.connected;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  },
  connectWorkspace: connect,
  disconnectWorkspace: disconnect,
}));
function update(state: Partial<typeof connection>) {
  act(() => {
    Object.assign(connection, state);
    for (const listener of listeners) listener();
  });
}
beforeEach(() => {
  Object.assign(connection, {
    status: "disconnected",
    error: null,
    kind: "website",
    connected: false,
  });
  connect.mockReset().mockResolvedValue(undefined);
  disconnect.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  expect(listeners.size).toBe(0);
});

describe("WorkspaceConnection", () => {
  it("does not connect on mount, including Strict Mode, and calls directly from click", () => {
    render(
      <StrictMode>
        <WorkspaceConnection className="site-control" />
      </StrictMode>,
    );
    expect(connect).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("status")
        .parentElement?.classList.contains("site-control"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Connect to workspace" }),
    );
    expect(connect).toHaveBeenCalledTimes(1);
  });
  it("shares pending, connected and revoked state across controls", () => {
    render(
      <>
        <WorkspaceConnection />
        <WorkspaceConnection />
      </>,
    );
    update({ status: "connecting" });
    for (const button of screen.getAllByRole("button"))
      expect((button as HTMLButtonElement).disabled).toBe(true);
    update({ status: "connected", connected: true });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Disconnect" })[0]!,
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
    update({ status: "disconnecting", connected: false });
    expect(
      (screen.getAllByRole("button")[0] as HTMLButtonElement).disabled,
    ).toBe(true);
    update({ status: "disconnected" });
    expect(
      screen.getAllByRole("button", { name: "Connect to workspace" }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("status")[0]?.textContent).toContain(
      "Not connected",
    );
    expect(connect).not.toHaveBeenCalled();
  });
  it("shows errors as text and requires an explicit retry", async () => {
    connect.mockRejectedValueOnce(new Error("denied"));
    render(<WorkspaceConnection />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    update({ error: "Connection denied <script>" });
    expect(screen.getByRole("status").textContent).toBe(
      "Connection denied <script>",
    );
    expect(document.querySelector("script")).toBeNull();
    expect(connect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button"));
    expect(connect).toHaveBeenCalledTimes(2);
  });
  it("explains missing hosting and never offers installed panels a disconnect action", () => {
    update({ status: "unavailable", kind: "unavailable" });
    render(<WorkspaceConnection />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Vibestudio browser panel",
    );
    update({ status: "connected", kind: "installed", connected: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Running inside your workspace.",
    );
  });
  it("unmounts without disconnecting the shared runtime", () => {
    update({ status: "connected", connected: true });
    render(<WorkspaceConnection />).unmount();
    expect(disconnect).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
