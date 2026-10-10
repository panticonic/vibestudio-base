import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { z } from "zod";
import { createRpcMethods } from "@vibestudio/shared/rpcMethods";
import { defineContract } from "../core/defineContract.js";
import {
  createCallProxy,
  createPanelHandle,
  unavailableCdp,
} from "./handles.js";

describe("createCallProxy", () => {
  it("remains safely inspectable without becoming a thenable", async () => {
    const call = vi.fn(async () => "pong");
    const proxy = createCallProxy(schemaRpcMock({ call }), "panel:runtime");

    expect(String(proxy)).toBe("[PanelHandle RPC call proxy]");
    expect(Object.prototype.toString.call(proxy)).toBe(
      "[object PanelHandleRpc]",
    );
    expect(Reflect.get(proxy, "then")).toBeUndefined();
    await expect(Promise.resolve(proxy)).resolves.toBe(proxy);
  });

  it("still dispatches arbitrary string method names", async () => {
    const call = vi.fn(async () => "pong");
    const proxy = createCallProxy(
      schemaRpcMock({ call }),
      "panel:runtime",
    ) as Record<string, (...args: unknown[]) => Promise<unknown>>;

    await expect(proxy["ping"]?.("value")).resolves.toBe("pong");
    expect(call).toHaveBeenCalledWith(
      "panel:runtime",
      "ping",
      ["value"],
      undefined,
    );
  });
});

it("validates a panel contract's arguments and results before exposing its types", async () => {
  const wire = vi.fn(async () => "pong");
  const methods = createRpcMethods(
    "panel",
    {
      ping: {
        website: { kind: "closed", reason: "Test panel contract." },
        args: z.tuple([z.string()]),
        returns: z.string(),
      },
    },
    "",
  );
  const rpc = { ...schemaRpcMock({ call: wire }), emit: vi.fn(), on: vi.fn() };
  const panel = createPanelHandle({
    rpc,
    metadata: { id: "panel:runtime" },
    cdp: unavailableCdp("panel:runtime"),
  });
  const contract = defineContract({
    source: "panels/test",
    child: { methods },
  });
  const contracted = panel.withContract(contract, "child");
  await expect(contracted.call.ping("value")).resolves.toBe("pong");
  wire.mockClear();
  // @ts-expect-error The receiver requires a string.
  await expect(contracted.call.ping(42)).rejects.toThrow();
  expect(wire).not.toHaveBeenCalled();
  wire.mockResolvedValueOnce(42 as never);
  await expect(contracted.call.ping("value")).rejects.toThrow();
  expect(panel.call).not.toBe(contracted.call);
});
