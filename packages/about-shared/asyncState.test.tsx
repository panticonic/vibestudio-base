// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAsyncResource } from "./asyncState";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(cleanup);

describe("resource refresh lifetime", () => {
  it("retains an empty successful result through refresh and keeps failures until success", async () => {
    const initial = deferred<string[]>();
    const update = deferred<string[]>();
    const retry = deferred<string[]>();
    const read = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(update.promise)
      .mockReturnValueOnce(retry.promise);
    const { result } = renderHook(() => useAsyncResource(read));
    expect(result.current.loading).toBe(true);
    await act(async () => initial.resolve([]));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    await act(async () => {
      update.reject(new Error("Offline"));
      await pending;
    });
    expect(result.current.error).toBe("Offline");
    act(() => {
      pending = result.current.refresh();
    });
    expect(result.current.error).toBe("Offline");
    expect(result.current.data).toEqual([]);
    await act(async () => {
      retry.resolve(["new"]);
      await pending;
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(["new"]);
  });

  it("ignores superseded reads and results arriving after disposal", async () => {
    const old = deferred<string[]>();
    const current = deferred<string[]>();
    const read = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result, unmount } = renderHook(() => useAsyncResource(read));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    await act(async () => {
      current.resolve(["current"]);
      await pending;
    });
    await act(async () => old.reject(new Error("Stale failure")));
    expect(result.current.data).toEqual(["current"]);
    expect(result.current.error).toBeNull();
    const final = deferred<string[]>();
    read.mockReturnValueOnce(final.promise);
    act(() => {
      pending = result.current.refresh();
    });
    unmount();
    await act(async () => {
      final.resolve(["disposed"]);
      await pending;
    });
    expect(result.current.data).toEqual(["current"]);
  });
});
