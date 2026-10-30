import vm from "node:vm";
import { tameRealmCodegen } from "@vibestudio/shared/evalConfinement";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import type { NewFunction } from "./realm.js";

/**
 * A `newFunction` for tests: functions compiled into their own vm context whose
 * code generation is disabled, the arrangement workerd's `UNSAFE_EVAL` gives the
 * eval engine (the confinement refuses a realm that can still compile code).
 */
export function testNewFunction(): NewFunction {
  const context = vm.createContext({});
  tameRealmCodegen(vm.runInContext("globalThis", context) as Record<string, unknown>);
  return (body, name, ...argNames) =>
    vm.runInContext(`(function ${JSON.stringify(name).replace(/\W/g, "_")}(${argNames.join(", ")}) {\n${body}\n})`, context) as (
      ...args: unknown[]
    ) => unknown;
}

export const EXECUTOR_ENTRY = makeTestCatalogEntry({
  ref: "test:executor-small",
  id: "executor-small",
  name: "executor-small",
  provider: "test",
  baseUrl: "http://test.invalid/v1",
});

/** One Pi assistant message that calls a tool, as the model gateway returns it. */
export function toolCallMessage(name: string, args: Record<string, unknown>, tokens = { input: 11, output: 7 }) {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: `call_${name}`, name, arguments: args }],
    api: "openai-completions",
    provider: "test",
    model: "executor-small",
    usage: {
      input: tokens.input,
      output: tokens.output,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: tokens.input + tokens.output,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 0,
  };
}

export interface FakeServices {
  /** Answers one gateway turn; a function of the Pi context and the options it was asked with. */
  turn?: (input: { turnId: string; model: string; context: any; options?: any }, signal?: AbortSignal) => Promise<unknown>;
  /** Natlang records calls, by method name. */
  records?: Record<string, (input: any) => unknown>;
  roleResolution?: { model: unknown; reason?: string };
}

/**
 * An `rpc` that answers the three services the provider talks to (model
 * gateway, model settings, natlang records) the way their durable objects do.
 */
export function fakeRpc(services: FakeServices) {
  const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
  const rpc = {
    async call(target: string, method: { name: string }, args: unknown[], options?: { signal?: AbortSignal }) {
      calls.push({ target, method: method.name, args });
      if (target === "main") {
        const [query] = args as [string];
        return { kind: "durable-object", source: query, className: query, objectKey: "k", targetId: `do:${query}` };
      }
      const [input] = args as [any];
      switch (target) {
        case "do:vibestudio.model-gateway.v1":
          if (method.name === "turn") {
            const message = await services.turn!(input, options?.signal);
            return { status: "completed", turnId: input.turnId, message, model: input.model, usage: (message as any).usage, attribution: { callerId: "test", callerKind: "do" } };
          }
          return { cancelled: false };
        case "do:vibestudio.models.v1":
          if (method.name === "resolveRole") {
            const resolution = services.roleResolution ?? { model: EXECUTOR_ENTRY };
            return { role: input, ref: (resolution.model as any)?.ref ?? null, source: "local", model: resolution.model, reason: resolution.reason ?? "test" };
          }
          return method.name === "getModel" && input === EXECUTOR_ENTRY.ref ? EXECUTOR_ENTRY : null;
        case "do:vibestudio.natlang.v1": {
          const handler = services.records?.[method.name];
          if (handler) return handler(input);
          if (method.name === "liveInterest") return { subscribed: false };
          if (method.name === "record") return { recordId: input.record.call_id };
          return undefined;
        }
      }
      throw new Error(`fake rpc: no ${target} ${method.name}`);
    },
  };
  return { rpc, calls };
}
