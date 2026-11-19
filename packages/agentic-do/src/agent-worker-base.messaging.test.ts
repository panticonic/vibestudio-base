import {afterEach,expect,it,vi} from "vitest";
import {createRpcFs} from "@workspace/runtime/worker/rpc-fs";
import {createNativeVesselTestDO} from "./testing/native-vessel.js";
import {executeTool,toolResultDetails} from "@workspace/harness/testing/native-tool";
import type {ParticipantDescriptor} from "@workspace/harness";
import type {ResolveAddresseeContext} from "@workspace/agentic-protocol";
import {AgentWorkerBase} from "./agent-worker-base.js";
import {ChannelClient} from "./channel-client.js";

class OwnedMessagingAgent extends AgentWorkerBase {
  readonly send=vi.fn(async(..._args:Parameters<ChannelClient["send"]>)=>{});
  readonly roster:ResolveAddresseeContext={channelId:"owned",roster:[{id:"mira",kind:"agent",displayName:"Mira",metadata:{handle:"mira"}},{id:"alex",kind:"agent",displayName:"Alex",metadata:{handle:"alex"}}]};
  protected override getParticipantInfo():ParticipantDescriptor {return {name:"Synthetic sender",type:"agent",handle:"sender",metadata:{}};}
  protected override async addresseeContext(){return this.roster;}
  protected override conversationAddresseeContext(){return this.roster;}
  protected override createChannelClient(){const client=new ChannelClient(this.rpc,{source:"workers/pubsub-channel",className:"PubSubChannel",objectKey:"owned"});client.send=this.send;return client;}
  prepare(){vi.spyOn(this.subscriptions,"getParticipantId").mockReturnValue("sender");}
  callNativeNotify(content:string,to:string){return this.notifyConversation("owned",createRpcFs(this.rpc),{content,to,alert:"none"},{invocationId:"owned-operation",rpc:this.rpc});}
  tool(){return this.createNotifyTool("owned",createRpcFs(this.rpc),{invocationId:"owned-operation",commandId:"owned-operation",rpc:this.rpc});}
  bindings(){return this.localMessagingBindings({lease:{fixtureId:"fixture-owned",channelId:"owned",senderParticipantId:"sender",operationId:"owned-operation",active:true,recipients:[{ref:"@mira",participantId:"mira",kind:"agent"}]},assertOwnedFixture:async()=>({fixtureId:"fixture-owned",channelId:"owned",senderParticipantId:"sender",operationId:"owned-operation",active:true,recipients:[{ref:"@mira",participantId:"mira",kind:"agent"}]}),inspectCommitted:async()=>({channelId:"owned",messageId:null,committed:false,recipientRefs:[],content:null,evidence:[]})});}
  recipients(){return this.conversationAddressees("owned");}
}
const databases:Array<{close():void}>=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
it("native and tool callers use the same original targeted notify operation and discovery",async()=>{
 const {instance,db}=await createNativeVesselTestDO(OwnedMessagingAgent);databases.push(db);instance.prepare();
 expect(instance.recipients().some(row=>row.ref==="@mira")).toBe(true);
 const native=await instance.callNativeNotify("Alex reviews tomorrow","@mira");
 expect(instance.send).toHaveBeenCalledWith("sender","say:owned-operation","Alex reviews tomorrow",expect.objectContaining({to:[{kind:"participant",participantId:"mira"}]}));
 const tool=await executeTool(instance.tool(),{content:"Alex reviews tomorrow",to:"@mira",alert:"none"});
 expect(toolResultDetails(tool)).toEqual(native.details);
});
it("unknown recipient fails without a fallback message",async()=>{
 const {instance,db}=await createNativeVesselTestDO(OwnedMessagingAgent);databases.push(db);instance.prepare();
 await expect(instance.callNativeNotify("Build ready","@missing")).rejects.toThrow();expect(instance.send).not.toHaveBeenCalled();
});

it("owned binding resolves and delivers through the original notify with one durable operation identity",async()=>{
 const {instance,db}=await createNativeVesselTestDO(OwnedMessagingAgent);databases.push(db);instance.prepare();
 const binding=instance.bindings(),snapshot=await binding.read.inspect("Tell Mira the build passed.");
 const receipt=await binding.send.send(snapshot.revision,"Tell Mira the build passed.","@mira","Alex reviews tomorrow");
 expect(receipt).toEqual({channelId:"owned",messageId:"say:owned-operation",to:"@mira",alert:"none"});
 await binding.send.send(snapshot.revision,"Tell Mira the build passed.","@mira","Alex reviews tomorrow");
 expect(instance.send).toHaveBeenCalledOnce();
});
