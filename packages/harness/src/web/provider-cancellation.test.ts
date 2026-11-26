import { describe, it, expect, vi } from "vitest";
import { rpcCallerAbortedError } from "@vibestudio/rpc";
import { createCredentialPresenceProbe } from "./provider.js";
describe("caller-owned credential probes", () => {
  it("preserves caller abandonment instead of selecting an uncredentialed provider", async () => {
    const reason = rpcCallerAbortedError("owner cancelled");
    const resolve = vi.fn().mockRejectedValue(reason);
    await expect(createCredentialPresenceProbe(resolve)("https://api.tavily.com/")).rejects.toBe(reason);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it("distinguishes unavailable credentials from present credentials", async () => {
    await expect(createCredentialPresenceProbe(async () => null)("origin")).resolves.toBe(false);
    await expect(createCredentialPresenceProbe(async () => ({ id: "owned" }))("origin")).resolves.toBe(true);
    await expect(createCredentialPresenceProbe(async () => { throw new Error("not available to caller"); })("origin")).resolves.toBe(false);
  });
});
