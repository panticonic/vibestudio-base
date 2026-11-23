import { describe, it, expect } from "vitest";
import { build } from "esbuild";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const deferred = () => {
  let resolve!: (value?: any) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<any>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

// Bundle the actual SDK and receiver into separate confined VMs. Only the
// declared service client is endowed in the caller: no fetch or WebSocket.
// The receiver's native connection is the explicit test boundary, not Chrome.
async function fixture() {
  const calls: string[] = [],
    handlers = new Map<string, (value: unknown) => void>();
  const native = {
    send: async (method: string) => {
      calls.push(method);
      if (method === "HeapProfiler.takeHeapSnapshot")
        handlers.get("HeapProfiler.addHeapSnapshotChunk")?.({
          chunk: "native-bytes",
        });
      return { ok: true };
    },
    on: (method: string, fn: any) => {
      handlers.set(method, fn);
      return () => {
        handlers.delete(method);
      };
    },
    close: () => {
      calls.push("native-close");
    },
  };
  const globals: any = {
    console,
    crypto: globalThis.crypto,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    __caller: { callerId: "eval-a", callerKind: "code", workspaceId: "ws" },
    __context: null,
    __native: native,
    __calls: calls,
  };
  const plugin = {
    name: "bounded-fixture",
    setup(b: any) {
      b.onResolve({ filter: /^@/ }, (args: any) => ({
        path: args.path,
        namespace: "bounded",
      }));
      b.onResolve({ filter: /\/profiles-store\.js$/ }, () => ({
        path: "profiles-store",
        namespace: "bounded",
      }));
      b.onResolve({ filter: /\/run\.js$/ }, () => ({
        path: "run",
        namespace: "bounded",
      }));
      b.onLoad({ filter: /.*/, namespace: "bounded" }, ({ path: p }: any) => ({
        loader: "ts",
        contents:
          p === "@workspace/runtime"
            ? `export function createDurableObjectServiceClient(protocol, methods) {if(protocol!=="vibestudio.testkit-driver.v1")throw Error("wrong protocol"); return {call:(method,...args)=>globalThis.__invoke(method,args)};}`
            : p === "@vibestudio/shared/rpcMethods"
              ? `export const createReceiverRpcMethods=names=>Object.fromEntries(names.map(n=>[n,n]));`
              : p === "@workspace/runtime/worker/kernel"
                ? `export class DurableObjectBase {get caller(){return globalThis.__caller} rpc={call:async(_,method,args)=>{globalThis.__calls.push("authorize:"+args[0]);if(args[0]!=="allowed")throw Error("target denied");return {wsEndpoint:"native-authorized",token:"native-grant"}}}; } export const rpc=()=>()=>{};`
                : p === "@workspace/cdp-client"
                  ? `export const CdpConnection={connect:async(endpoint,token)=>{if(endpoint!=="native-authorized"||token!=="native-grant")throw Error("ungranted");return globalThis.__native;}};`
                  : p === "@vibestudio/service-schemas/mainRpc"
                    ? `export const mainRpcMethods={"panelCdp.getCdpEndpoint":"endpoint"};`
                    : p === "@workspace/testkit/profiling"
                      ? `export const cpuProfileRef=()=>({}),persistProfile=()=>{},profilePath=()=>"";`
                      : p === "profiles-store"
                        ? `export const profilePath=()=>"profile-artifact";export const saveProfile=async(ref,data)=>({...ref,data});`
                        : p === "run"
                          ? `export const activeTestContext=()=>globalThis.__context;`
                          : (() => {
                              throw Error("Unexpected fixture import " + p);
                            })(),
      }));
    },
  };
  async function bundle(entry: string, name: string) {
    return (
      await build({
        stdin: { contents: entry, resolveDir: root, loader: "ts" },
        bundle: true,
        write: false,
        format: "iife",
        globalName: name,
        platform: "neutral",
        target: "es2022",
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
        plugins: [plugin],
      })
    ).outputFiles[0]!.text;
  }
  const receiver = vm.createContext(globals);
  vm.runInContext(
    await bundle(
      'export {TestkitDriverDO} from "./workers/testkit-driver/index.ts"',
      "Receiver",
    ),
    receiver,
  );
  const worker = new receiver.Receiver.TestkitDriverDO();
  const invoke = async (method: string, args: any[]) => worker[method](...args);
  const client = vm.createContext({ ...globals, __invoke: invoke });
  vm.runInContext(
    await bundle(
      'import "./packages/testkit/src/driver.ts"; export * from "./packages/testkit/src/cdp.ts"; export * from "./packages/testkit/src/profile.ts"',
      "SDK",
    ),
    client,
  );
  return { sdk: client.SDK, client, receiver, worker, native, calls, handlers };
}

describe("authorized raw panel CDP", () => {
  it.each(["browser", "workspace"])(
    "routes %s panels through native target authorization without ambient networking",
    async (kind) => {
      const f = await fixture();
      expect(f.client.WebSocket).toBeUndefined();
      expect(f.client.fetch).toBeUndefined();
      const session = await f.sdk.rawCdpSession({ id: "allowed", kind });
      expect(await session.send("Runtime.enable")).toEqual({ ok: true });
      await session.close();
      expect(f.calls).toEqual([
        "authorize:allowed",
        "Runtime.enable",
        "native-close",
      ]);
      await expect(
        f.sdk.rawCdpSession({ id: "foreign", kind }),
      ).rejects.toThrow("target denied");
    },
  );
  it("binds all native session operations to authenticated caller identity", async () => {
    const f = await fixture();
    const { sessionId } = await f.worker.cdpOpen("allowed");
    expect(sessionId).toMatch(/^cdp-[0-9a-f-]{36}$/);
    f.receiver.__caller = {
      callerId: "eval-b",
      callerKind: "code",
      workspaceId: "ws",
    };
    for (const [method, args] of [
      ["cdpSend", [sessionId, "Runtime.enable"]],
      ["cdpSubscribe", [sessionId, "event"]],
      ["cdpDrainEvents", [sessionId, 0]],
      ["cdpClose", [sessionId]],
    ] as const)
      await expect(f.worker[method](...args)).rejects.toThrow(
        "different caller",
      );
    f.receiver.__caller = {
      callerId: "eval-a",
      callerKind: "code",
      workspaceId: "ws",
    };
    await f.worker.cdpClose(sessionId);
  });
  it("joins subscriptions and delivers heap chunks before the command returns", async () => {
    const f = await fixture(),
      session = await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" });
    const chunks: unknown[] = [];
    session.on("HeapProfiler.addHeapSnapshotChunk", (x: unknown) =>
      chunks.push(x),
    );
    await session.send("HeapProfiler.takeHeapSnapshot");
    expect(chunks).toEqual([{ chunk: "native-bytes" }]);
    await session.close();
  });
  it("joins native close once and keeps final events even with no timer tick", async () => {
    const f = await fixture(),
      session = await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" });
    const events: unknown[] = [];
    session.on("event", (x: unknown) => events.push(x));
    await session.send("Runtime.enable");
    f.handlers.get("event")?.({ final: 1 });
    const gate = deferred();
    f.client.__invoke = async (method: string, args: any[]) => {
      if (method === "cdpClose") {
        const result = await f.worker.cdpClose(...args);
        await gate.promise;
        return result;
      }
      return f.worker[method](...args);
    };
    const closed = session.close();
    expect(session.close()).toBe(closed);
    expect(f.calls.at(-1)).toBe("native-close");
    let done = false;
    void closed.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    gate.resolve();
    await closed;
    expect(events).toEqual([{ final: 1 }]);
    expect(f.calls.filter((x) => x === "native-close")).toHaveLength(1);
  });
  it("retires authority before failing cleanup and preserves primary plus cleanup errors", async () => {
    const f = await fixture(),
      session = await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" });
    f.native.close = () => {
      throw Error("cleanup failed");
    };
    const error = await f.sdk
      ._usingCdpSession(session, async () => {
        throw Error("operation failed");
      })
      .catch((e: unknown) => e);
    expect(error.errors[0].message).toBe("operation failed");
    expect(error.errors[1].errors[0].message).toBe("cleanup failed");
    expect((await f.worker.ping()).sessions).toBe(0);
  });
  it("rejects an overflowed event stream instead of publishing a truncated heap", async () => {
    const f = await fixture(),
      session = await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" });
    session.on("event", () => {});
    await session.send("Runtime.enable");
    for (let i = 0; i < 2001; i++) f.handlers.get("event")?.({ i });
    await expect(session.close()).rejects.toThrow("event buffer overflow");
    expect((await f.worker.ping()).sessions).toBe(0);
  });
  it("awaits heap helper release and persists all actual chunk bytes", async () => {
    const f = await fixture();
    const gate = deferred();
    f.client.__invoke = async (method: string, args: any[]) => {
      const result = await f.worker[method](...args);
      if (method === "cdpClose") await gate.promise;
      return result;
    };
    let finished = false;
    const pending = f.sdk
      .heapSnapshot({ id: "allowed", kind: "browser" })
      .then((x: any) => {
        finished = true;
        return x;
      });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(f.calls.at(-1)).toBe("native-close");
    expect(finished).toBe(false);
    gate.resolve();
    expect((await pending).data).toBe("native-bytes");
  });
  it("releases a start-profile session when profiler setup fails", async () => {
    const f = await fixture();
    f.native.send = async () => {
      throw Error("unsupported profiler");
    };
    await expect(
      f.sdk.startPanelProfile({ id: "allowed", kind: "browser" }),
    ).rejects.toThrow("unsupported profiler");
    expect(f.calls.at(-1)).toBe("native-close");
    expect((await f.worker.ping()).sessions).toBe(0);
  });
  it("surfaces polling failures while still revoking the native session", async () => {
    const f = await fixture(),
      session = await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" });
    f.client.__invoke = async (method: string, args: any[]) => {
      if (method === "cdpDrainEvents") throw Error("event transport failed");
      return f.worker[method](...args);
    };
    session.on("event", () => {});
    await new Promise((resolve) => setTimeout(resolve, 270));
    await expect(session.send("Runtime.enable")).rejects.toThrow(
      "CDP event polling failed",
    );
    await expect(session.close()).rejects.toThrow("event transport failed");
    expect(f.calls.at(-1)).toBe("native-close");
  });
  it("revokes immediately and joins a pending command before close completes", async () => {
    const f = await fixture(),
      session = await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" }),
      command = deferred();
    f.native.send = () => command.promise;
    const result = session.send("Runtime.enable");
    await new Promise((resolve) => setTimeout(resolve, 0));
    let finished = false;
    const closing = session.close().then(() => (finished = true));
    expect(f.calls.at(-1)).toBe("native-close");
    await Promise.resolve();
    expect(finished).toBe(false);
    command.resolve({ done: true });
    await result;
    await closing;
    expect(finished).toBe(true);
  });
  it("registers pending acquisition with the active test context", async () => {
    const f = await fixture();
    let acquired = 0,
      release: (() => Promise<void>) | undefined;
    f.client.__context = {
      acquire: async (create: any, cleanup: any) => {
        acquired++;
        const value = await create();
        release = () => cleanup(value);
        return value;
      },
    };
    await f.sdk.rawCdpSession({ id: "allowed", kind: "browser" });
    expect(acquired).toBe(1);
    await release!();
    expect(f.calls.at(-1)).toBe("native-close");
  });
});
