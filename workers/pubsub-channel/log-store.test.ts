import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { PubSubChannel } from "./channel-do.js";
import { ChannelLog } from "./log-store.js";
import type { SqlStorage } from "@workspace/runtime/worker";

async function owner() {
  const fixture = await createTestDO(PubSubChannel,{__objectKey:"channel-1"});
  const storage = (fixture.instance as unknown as {ctx:{storage:{transactionSync<T>(operation:()=>T):T}}}).ctx.storage;
  const calls: string[] = [];
  const blobs = new Map<string, string>();
  const log = new ChannelLog({call:async <Args extends unknown[], Result>(_target: string,method: import("@vibestudio/rpc").RpcMethod<Args, Result>,args: Args): Promise<Result> => {
    const name = method.name; calls.push(name);
    if (name === "blobstore.putText") { const value = args![0] as string; const digest = sha256HexSyncText(value); blobs.set(digest,value); return {digest,size:new TextEncoder().encode(value).length} as Result; }
    if (name === "blobstore.getText") return (blobs.get(args![0] as string) ?? null) as Result;
    throw new Error(`Unexpected remote history dependency: ${name}`);
  }},"channel-1",fixture.sql as SqlStorage,(operation)=>storage.transactionSync(operation));
  return {...fixture,log,calls};
}

describe("ChannelLog owner history", () => {
  it("derives registry changes from local canonical history before observation and detaches cached results", async () => {
    const { log, calls } = await owner();
    const register = (typeId: string, source: string) => log.append({ type: "agentic.trajectory.v1/event", payload: { createdAt: "2026-10-10T12:00:00.000Z", kind: "messageType.registered", payload: { protocol: "agentic.trajectory.v1", typeId, displayMode: "inline", source: { type: "code", code: source } }, actor: { kind: "agent", id: "agent-1" } }, senderId: "agent-1", contentClass: "internal", externalKeys: [] });
    await register("z", "hello");
    await register("a", "world");
    const first = await log.listMessageTypes();
    expect(first.map((row) => row.typeId)).toEqual(["a", "z"]);
    first[0]!.typeId = "mutated";
    expect((await log.getMessageType("a"))?.source).toEqual({ type: "code", code: "world" });
    await log.append({ type: "agentic.trajectory.v1/event", payload: { createdAt: "2026-10-10T12:00:00.000Z", kind: "messageType.cleared", payload: { protocol: "agentic.trajectory.v1", typeId: "a" }, actor: { kind: "agent", id: "agent-1" } }, senderId: "agent-1", contentClass: "internal", externalKeys: [] });
    expect(await log.getMessageType("a")).toBeNull();
    expect((await log.listMessageTypes()).map((row) => row.typeId)).toEqual(["z"]);
    expect(log.ledger.observedSequence()).toBe(0);
    expect(calls.every((method) => method.startsWith("blobstore."))).toBe(true);
  });

  it("rejects invalid registry events before advancing the local canonical head", async () => {
    const { log } = await owner();
    await expect(log.append({ type: "agentic.trajectory.v1/event", payload: { createdAt: "2026-10-10T12:00:00.000Z", kind: "messageType.registered", payload: { protocol: "agentic.trajectory.v1", typeId: "broken", displayMode: "invalid", source: "hello" }, actor: { kind: "agent", id: "agent-1" } }, senderId: "agent-1", contentClass: "internal", externalKeys: [] })).rejects.toThrow();
    expect(await log.headSeq()).toBe(0);
    expect(await log.getMessageType("broken")).toBeNull();
  });

  it("rejects a second turn opening before local commit, preserving exact retries and fork boundaries",async()=>{
    const parent=await owner();
    const event={kind:"turn.opened",actor:{kind:"agent",id:"agent-1"},turnId:"turn-one",payload:{protocol:"agentic.trajectory.v1"},createdAt:"2026-10-10T12:00:00.000Z"};
    const input={type:"agentic.trajectory.v1/event",payload:event,senderId:"agent-1",senderMetadata:{type:"agent"},messageId:"turn-opening",contentClass:"internal" as const,externalKeys:[]};
    const original=await parent.log.append(input);
    await expect(parent.log.append(input)).resolves.toEqual(original);
    await expect(parent.log.append({...input,messageId:"second-opening"})).rejects.toThrow("duplicate turn.opened for turn turn-one");
    expect(await parent.log.headSeq()).toBe(1);
    await parent.log.append({type:"test.tail",payload:{value:2},senderId:"agent-1",contentClass:"internal",externalKeys:[]});
    const Database=parent.db.constructor as {new(data:Uint8Array):typeof parent.db};
    const clone=async(channelId:string,through:number)=>{
      const fixture=await createTestDO(PubSubChannel,{__objectKey:channelId},{db:new Database(parent.db.export())});
      const storage=(fixture.instance as unknown as {ctx:{storage:{transactionSync<T>(operation:()=>T):T}}}).ctx.storage;
      const log=new ChannelLog({call:async()=>{throw new Error("Unexpected remote dependency");}},channelId,fixture.sql as SqlStorage,(operation)=>storage.transactionSync(operation));
      log.ledger.initializeClone();
      await log.forkFrom("channel-1",through);
      return log;
    };
    const inherited=await clone("child-inherited",1);
    await expect(inherited.append({...input,messageId:"child-duplicate"})).rejects.toThrow("duplicate turn.opened for turn turn-one");
    expect(await inherited.headSeq()).toBe(1);
    expect((await inherited.replayAfter({after:0},{})).logEvents[0]).toEqual(original);
    const beforeOpening=await clone("child-before",0);
    await expect(beforeOpening.append({...input,messageId:"child-first"})).resolves.toMatchObject({id:1,messageId:"child-first"});
    expect(await parent.log.headSeq()).toBe(2);
  });

  it("rejects oversized initial and backward replay pages", async () => {
    const {log} = await owner();
    await expect(log.replayInitial(501, {})).rejects.toThrow(/between 0 and 500/i);
    await expect(log.replayBefore(10, 501, {})).rejects.toThrow(/between 1 and 500/i);
  });

  it("returns bounded forward pages under one stable owner watermark without global observation", async () => {
    const {log,calls} = await owner();
    for(let seq=1;seq<=1201;seq++) await log.append({type:"message",payload:{seq},senderId:"agent-1",messageId:`env-${seq}`,contentClass:"internal",externalKeys:[]});
    const first=await log.replayAfter({after:0},{});
    const watermark=first.ready.snapshotLastSeq!;
    await log.append({type:"message",payload:{seq:1202},senderId:"agent-1",messageId:"later",contentClass:"internal",externalKeys:[]});
    const second=await log.replayAfter({after:first.ready.replayToId!,throughSeq:watermark},{});
    const third=await log.replayAfter({after:second.ready.replayToId!,throughSeq:watermark},{});
    expect([first.logEvents.length,second.logEvents.length,third.logEvents.length]).toEqual([500,500,201]);
    expect(first.ready).toMatchObject({replayFromId:1,replayToId:500,snapshotLastSeq:1201,hasMoreBefore:false,hasMoreAfter:true});
    expect(third.ready).toMatchObject({replayFromId:1001,replayToId:1201,snapshotLastSeq:1201,hasMoreAfter:false});
    expect(calls).toEqual([]);
    expect(log.ledger.observedSequence()).toBe(0);
    expect(log.ledger.peekObservation()).toMatchObject({kind:"append",sequence:1,envelope:{envelopeId:"env-1"}});
  });

  it("keeps exact retries, immutable hashes and pending observation across owner reactivation", async () => {
    const fixture=await owner();
    const input={type:"message",payload:{value:"one"},senderId:"agent-1",messageId:"immutable",contentClass:"internal" as const,externalKeys:[]};
    const first=await fixture.log.append(input);
    await expect(fixture.log.append(input)).resolves.toEqual(first);
    await expect(fixture.log.append({...input,payload:{value:"other"}})).rejects.toThrow("different canonical content");
    const reopened=await createTestDO(PubSubChannel,{__objectKey:"channel-1"},{db:fixture.db});
    const storage=(reopened.instance as unknown as {ctx:{storage:{transactionSync<T>(operation:()=>T):T}}}).ctx.storage;
    const log=new ChannelLog({call:async()=>{throw new Error("Unexpected remote dependency");}},"channel-1",reopened.sql as SqlStorage,(operation)=>storage.transactionSync(operation));
    await expect(log.getEventByEnvelopeId("immutable")).resolves.toEqual(first);
    const debt=log.ledger.peekObservation()!;
    expect(debt).toMatchObject({kind:"append",sequence:1,envelope:{envelopeId:"immutable"}});
    log.ledger.markObservedThrough(1,1,"immutable");
    expect(log.ledger.peekObservation()).toBeNull();
  });
});
