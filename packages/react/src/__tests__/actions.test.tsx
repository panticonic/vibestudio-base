// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { afterEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  openPanel: vi.fn(),
  openExternal: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({ ...runtime, Rpc: {} }));
import { OpenLinkButtons, useAction } from "../actions.js";

afterEach(() => {
  cleanup();
  runtime.openPanel.mockReset();
  runtime.openExternal.mockReset();
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("useAction", () => {
  it("reports pending, failure, and a successful retry without rejecting", async () => {
    const attempts = [deferred(), deferred()];
    let call = 0;
    const { result } = renderHook(() =>
      useAction(() => attempts[call++]!.promise),
    );

    let first!: Promise<void>;
    act(() => {
      first = result.current.run();
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      attempts[0]!.reject(new Error("denied"));
      await first;
    });
    expect(result.current).toMatchObject({ status: "failed", error: "denied" });

    await act(async () => {
      const second = result.current.run();
      attempts[1]!.resolve();
      await second;
    });
    expect(result.current).toMatchObject({ status: "done", error: null });
  });

  it("lets only the latest overlapping run settle the state", async () => {
    const attempts = [deferred(), deferred()];
    let call = 0;
    const { result } = renderHook(() =>
      useAction(() => attempts[call++]!.promise),
    );
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.run();
      second = result.current.run();
    });
    await act(async () => {
      attempts[1]!.resolve();
      await second;
      attempts[0]!.reject(new Error("stale"));
      await first;
    });
    expect(result.current).toMatchObject({ status: "done", error: null });
  });
});

describe("OpenLinkButtons", () => {
  it("opens internally or externally and shows only the failed action's error", async () => {
    runtime.openPanel.mockResolvedValue({});
    runtime.openExternal.mockRejectedValue(new Error("Approval denied"));
    render(
      <Theme>
        <OpenLinkButtons
          url="https://example.com/auth"
          expectedRedirectUri="https://app/cb"
        />
      </Theme>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Internal/ }));
    });
    expect(runtime.openPanel).toHaveBeenCalledWith("https://example.com/auth", {
      focus: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /External/ }));
    });
    expect(runtime.openExternal).toHaveBeenCalledWith(
      "https://example.com/auth",
      {
        expectedRedirectUri: "https://app/cb",
      },
    );
    expect(
      screen.getByText("Approval denied — retry when ready."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Internal/ })).not.toHaveProperty(
      "disabled",
      true,
    );
  });
});
