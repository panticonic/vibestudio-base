import { expect, it } from "vitest";
import { captureExchange } from "./modelTurnCapture.js";
import { natlangAppendExchangeInputSchema } from "@workspace/natlang-records/contract";
import { serializeRpcFailure, deserializeRpcFailure } from "@vibestudio/rpc";
for (const kind of ["generation", "score"] as const)
  it(`${kind} persists actual RPC causes before rethrowing the identical failure`, async () => {
    const original = new TypeError("fetch failed", {
      cause: Object.assign(new Error("private body"), {
        code: "EAI_AGAIN",
        syscall: "getaddrinfo",
        address: "192.0.2.2",
        port: 443,
      }),
    });
    const error = deserializeRpcFailure(
      JSON.parse(JSON.stringify(serializeRpcFailure(original))),
    );
    const captured: any[] = [];
    await expect(
      captureExchange(
        kind,
        { invocation_id: "actual-call" },
        async () => {
          throw error;
        },
        async (exchange) => {
          natlangAppendExchangeInputSchema.parse({
            callId: "actual-call",
            ordinal: 0,
            exchange,
          });
          captured.push(exchange);
        },
      ),
    ).rejects.toBe(error);
    expect(captured[0].error).toEqual({
      name: "TypeError",
      message: "fetch failed",
      diagnostics: {
        name: "TypeError",
        cause: {
          name: "Error",
          code: "EAI_AGAIN",
          syscall: "getaddrinfo",
          address: "192.0.2.2",
          port: 443,
        },
      },
    });
    expect(JSON.stringify(captured)).not.toContain("private body");
    expect(captured[0]).not.toHaveProperty("reply");
  });
it("capture diagnostics never invoke failure accessors or fabricate returned values", async () => {
  let reads = 0;
  const error = {};
  for (const key of ["name", "message", "cause", "errors", "code"])
    Object.defineProperty(error, key, {
      get() {
        reads++;
        throw Error("observer hook");
      },
    });
  const captured: any[] = [];
  await expect(
    captureExchange(
      "generation",
      {},
      async () => {
        throw error;
      },
      (e) => {
        captured.push(e);
      },
    ),
  ).rejects.toBe(error);
  expect(reads).toBe(0);
  expect(captured[0].error).toEqual({
    name: "Error",
    message: "Model request failed",
  });
});
it("strict exchange admission refuses arbitrary diagnostic payloads", () => {
  const input = {
    callId: "call",
    ordinal: 0,
    exchange: {
      schema: "natlang.model-exchange/1",
      kind: "score",
      request: {},
      error: {
        name: "Error",
        message: "failure",
        diagnostics: { code: "EIO", headers: { authorization: "private" } },
      },
    },
  };
  expect(() => natlangAppendExchangeInputSchema.parse(input)).toThrow();
});
