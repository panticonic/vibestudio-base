import { describe, expect, it, vi } from "vitest";
import type { RpcClient } from "@vibestudio/rpc";
import { DurableObjectBase } from "./durable-base.js";
import { createTestDO } from "./durable-test-utils.js";
import { _initFsWithRpc, fs as workerFs } from "./fs.js";

class ClientProbe extends DurableObjectBase {
  readonly call = vi.fn(
    async (_target: string, method: string, _args: unknown[]) => {
      if (method === "blobstore.getText") return this.rpcSelfId;
      if (method === "fs.readFile") return this.rpcSelfId;
      throw new Error(`unexpected method: ${method}`);
    },
  );
  protected createTables(): void {}
  protected override get rpc(): RpcClient {
    return { call: this.call } as unknown as RpcClient;
  }
  readBlob() {
    return this.blobstore.getText("a".repeat(64));
  }
  readFile() {
    return this.fs.readFile("data.txt", "utf8");
  }
  client() {
    return this.blobstore;
  }
  resetClients() {
    this.resetRpcClients();
  }
}

const env = {
  WORKER_SOURCE: "workers/probe",
  WORKER_CLASS_NAME: "ClientProbe",
};

describe("Durable Object owned clients", () => {
  it("uses each object's RPC client without plain-worker initialization", async () => {
    const a = await createTestDO(ClientProbe, { ...env, __objectKey: "a" });
    const b = await createTestDO(ClientProbe, { ...env, __objectKey: "b" });
    expect(
      await Promise.all([a.instance.readBlob(), b.instance.readBlob()]),
    ).toEqual([
      "do:workers/probe:ClientProbe:a",
      "do:workers/probe:ClientProbe:b",
    ]);
    expect(a.instance.call).toHaveBeenCalledWith("main", "blobstore.getText", [
      "a".repeat(64),
    ]);
    expect(b.instance.call).toHaveBeenCalledTimes(1);
  });

  it("does not replace the plain worker filesystem binding", async () => {
    const workerCall = vi.fn(async () => "plain worker");
    _initFsWithRpc({ call: workerCall } as unknown as RpcClient);
    const a = await createTestDO(ClientProbe, { ...env, __objectKey: "a" });
    expect(await a.instance.readFile()).toBe("do:workers/probe:ClientProbe:a");
    expect(await workerFs.readFile("data.txt", "utf8")).toBe("plain worker");
    expect(workerCall).toHaveBeenCalledTimes(1);
  });

  it("resets cached clients and preserves the original remote failure", async () => {
    const a = await createTestDO(ClientProbe, { ...env, __objectKey: "a" });
    const before = a.instance.client();
    expect(a.instance.client()).toBe(before);
    a.instance.resetClients();
    expect(a.instance.client()).not.toBe(before);
    const failure = new Error("blob unavailable");
    a.instance.call.mockRejectedValueOnce(failure);
    await expect(a.instance.readBlob()).rejects.toBe(failure);
  });
});
