import { describe, expect, it, vi } from "vitest";
import type { RpcCaller } from "@vibestudio/rpc";
import { createExtensionsClient } from "./extensions.js";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";

interface FixtureExtensionApi {
  open(input: { command: string; cwd: string }): Promise<unknown>;
  attach(sessionId: string, cursor?: { after: string }): Promise<Response>;
  write(sessionId: string, data: string): Promise<unknown>;
}

declare module "@vibestudio/extension" {
  interface WorkspaceExtensions {
    "@test-extensions/probe": FixtureExtensionApi;
  }
}

const fixtureExtension = "@test-extensions/probe" as const;

describe("createExtensionsClient", () => {
  it("routes ordinary extension proxy methods through unary invoke", async () => {
    const rpc = createRpc();
    const extensions = createExtensionsClient(rpc);
    const fixture = extensions.use(fixtureExtension);

    await fixture.open({ command: "bash", cwd: "/repo" });

    expect(rpc.call).toHaveBeenCalledWith("main", "extensions.invoke", [
      fixtureExtension,
      "open",
      [{ command: "bash", cwd: "/repo" }],
    ], undefined);
    expect(rpc.stream).not.toHaveBeenCalled();
  });

  it("routes manifest-declared streaming methods through invokeStream", async () => {
    const response = new Response("stream");
    const rpc = createRpc(response, ["attach"]);
    const extensions = createExtensionsClient(rpc);
    const fixture = extensions.use(fixtureExtension);

    await expect(fixture.attach("session-1", { after: "42" })).resolves.toBe(response);
    await fixture.write("session-1", "x");

    expect(rpc.call).toHaveBeenCalledWith("main", "extensions.streamingMethods", [
      fixtureExtension,
    ], undefined);
    expect(rpc.stream).toHaveBeenCalledWith("main", "extensions.invokeStream", [
      fixtureExtension,
      "attach",
      ["session-1", { after: "42" }],
    ], undefined);
    expect(rpc.call).toHaveBeenCalledWith("main", "extensions.invoke", [
      fixtureExtension,
      "write",
      ["session-1", "x"],
    ], undefined);
  });

  it("lets the streamingMethods option override manifest resolution", async () => {
    const response = new Response("stream");
    const rpc = createRpc(response);
    const extensions = createExtensionsClient(rpc);
    const fixture = extensions.use(fixtureExtension, { streamingMethods: ["attach"] });

    await expect(fixture.attach("session-1")).resolves.toBe(response);

    expect(rpc.call).not.toHaveBeenCalledWith(
      "main",
      "extensions.streamingMethods",
      expect.anything(),
      undefined
    );
    expect(rpc.stream).toHaveBeenCalledWith("main", "extensions.invokeStream", [
      fixtureExtension,
      "attach",
      ["session-1"],
    ], undefined);
  });

  it("fails closed when streaming declarations cannot be loaded", async () => {
    const rpc = createRpc();
    rpc.call.mockRejectedValueOnce(new Error("registry unavailable"));
    const extensions = createExtensionsClient(rpc);
    const fixture = extensions.use(fixtureExtension);

    await expect(fixture.attach("session-1")).rejects.toThrow("registry unavailable");
    expect(rpc.call).not.toHaveBeenCalledWith(
      "main",
      "extensions.invoke",
      expect.anything(),
      undefined
    );
    expect(rpc.stream).not.toHaveBeenCalled();
  });

  it("exposes the untyped `invoke` primitive with the raw service signature", async () => {
    const rpc = createRpc();
    const extensions = createExtensionsClient(rpc);

    await extensions.invoke("@workspace-extensions/typecheck-service", "checkPanel", [
      "panels/app",
    ]);

    expect(rpc.call).toHaveBeenCalledWith("main", "extensions.invoke", [
      "@workspace-extensions/typecheck-service",
      "checkPanel",
      ["panels/app"],
    ], undefined);
  });

  it("routes provider namespaces only through invokeProvider", async () => {
    const rpc = createRpc();
    const extensions = createExtensionsClient(rpc);

    await extensions.invokeProvider("browserData", "getHistory", [{ limit: 1 }]);

    expect(rpc.call).toHaveBeenCalledWith("main", "extensions.invokeProvider", [
      "browserData",
      "getHistory",
      [{ limit: 1 }],
    ], undefined);
    expect(rpc.call).not.toHaveBeenCalledWith("main", "extensions.invoke", expect.anything(), undefined);
  });

  it("keeps Promise assimilation and inspection keys inert on extension proxies", () => {
    const rpc = createRpc();
    const extensions = createExtensionsClient(rpc);
    const fixture = extensions.use(fixtureExtension);

    expect(Reflect.get(fixture, "then")).toBeUndefined();
    expect(Reflect.get(fixture, "toJSON")).toBeUndefined();
    expect(rpc.call).not.toHaveBeenCalled();
    expect(rpc.stream).not.toHaveBeenCalled();
  });

  it("reports Promise-style catch misuse on extension proxies clearly", () => {
    const rpc = createRpc();
    const extensions = createExtensionsClient(rpc);
    const fixture = extensions.use(fixtureExtension);

    expect(() => (Reflect.get(fixture, "catch") as () => void)()).toThrow(
      'extensions.use("@test-extensions/probe") is synchronous'
    );
    expect(rpc.call).not.toHaveBeenCalled();
    expect(rpc.stream).not.toHaveBeenCalled();
  });
});

function createRpc(
  response: Response = new Response(),
  streamingMethods: string[] = []
): RpcCaller & {
  call: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
} {
  const wire = {
    call: vi.fn(async (_target: string, method: string) =>
      method === "extensions.streamingMethods" ? streamingMethods : null
    ),
    stream: vi.fn(async () => response),
  };
  return schemaRpcMock(wire) as RpcCaller & {
    call: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
  };
}
