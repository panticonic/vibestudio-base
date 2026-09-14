import { describe, expect, it, vi } from "vitest";
import { createOutsideContentReset } from "./outside-content-reset.js";

describe("outside content reset", () => {
  it("drops task authority the first time a source appears", async () => {
    const resetTaskAuthority = vi.fn(async () => undefined);
    const reset = createOutsideContentReset({ resetTaskAuthority });

    await reset.observe("web:example.test");
    expect(resetTaskAuthority).toHaveBeenCalledTimes(1);
  });

  it("does not re-prompt for the same origin twice", async () => {
    const resetTaskAuthority = vi.fn(async () => undefined);
    const reset = createOutsideContentReset({ resetTaskAuthority });

    await reset.observe("web:example.test");
    await reset.observe("WEB:Example.Test");
    expect(resetTaskAuthority).toHaveBeenCalledTimes(1);
  });

  it("resets again for a different origin", async () => {
    const resetTaskAuthority = vi.fn(async () => undefined);
    const reset = createOutsideContentReset({ resetTaskAuthority });

    await reset.observe("web:one.test");
    await reset.observe("web:two.test");
    expect(resetTaskAuthority).toHaveBeenCalledTimes(2);
  });

  it("retries a source whose reset failed rather than pretending it held", async () => {
    const resetTaskAuthority = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const reset = createOutsideContentReset({ resetTaskAuthority, onError });

    await reset.observe("web:example.test");
    expect(onError).toHaveBeenCalledTimes(1);
    await reset.observe("web:example.test");
    expect(resetTaskAuthority).toHaveBeenCalledTimes(2);
  });

  it("ignores an empty source", async () => {
    const resetTaskAuthority = vi.fn(async () => undefined);
    const reset = createOutsideContentReset({ resetTaskAuthority });
    await reset.observe("   ");
    expect(resetTaskAuthority).not.toHaveBeenCalled();
  });
});
