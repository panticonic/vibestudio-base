import { afterEach, expect, it, vi } from "vitest";
import { createContext, runInContext } from "node:vm";
import { build } from "esbuild";
import { WebSocketServer } from "ws";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { webSocketAuthProtocol } from "@vibestudio/rpc/protocol/webSocketAuthProtocol";
import { createWorkerdClient } from "./workerd.js";
import { createCdpAutomation } from "../panel/cdpAutomation.js";

const base = new URL("../../../../", import.meta.url).pathname;
afterEach(()=>vi.unstubAllGlobals());

async function confinedProgram(runtime: unknown) {
  const artifact=await build({stdin:{contents:`export {CdpConnection,BrowserImpl} from './packages/cdp-client/src/worker.ts'; export {profileWorkerd} from './packages/testkit/src/workerd-profile.ts';`,resolveDir:base},
    bundle:true,write:false,format:"cjs",platform:"neutral",
    external:["@workspace/runtime","@vibestudio/service-schemas/mainRpc","@vibestudio/rpc/protocol/webSocketAuthProtocol"],
    plugins:[{name:"actual-cdp-package",setup(builder){builder.onResolve({filter:/^@workspace\/cdp-client$/},()=>({path:base+"packages/cdp-client/src/worker.ts"}));}}]});
  const module={exports:{} as any};
  const modules:Record<string,unknown>={"@workspace/runtime":runtime,"@vibestudio/service-schemas/mainRpc":{mainRpcMethods},
    "@vibestudio/rpc/protocol/webSocketAuthProtocol":{webSocketAuthProtocol}};
  const context=createContext({module,exports:module.exports,require:(id:string)=>{if(!(id in modules))throw new Error("Undeclared module "+id);return modules[id];},
    URL,AbortSignal,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,queueMicrotask,console,btoa,atob});
  runInContext(artifact.outputFiles[0]!.text,context);
  expect(runInContext("typeof fetch + ':' + typeof WebSocket",context)).toBe("undefined:undefined");
  return module.exports;
}

it.each(["websocket","worker-upgrade"])("runs the official profiler and actual confined CDP connection through %s",async transport=>{
  const server=new WebSocketServer({host:"127.0.0.1",port:0});
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const address=server.address();if(typeof address==="string"||!address)throw new Error("No native test socket");
  const endpoint={wsEndpoint:`ws://127.0.0.1:${address.port}/workerd-inspector/test`,token:"owned-inspection-grant"};
  const methods:string[]=[];
  server.on("connection",socket=>socket.on("message",raw=>{
    const {id,method}=JSON.parse(String(raw));methods.push(method);
    const result=method==="Profiler.stop"?{profile:{nodes:[{id:1,callFrame:{functionName:"testWork"},hitCount:1}],startTime:0,endTime:1000,samples:[1],timeDeltas:[1000]}}:{};
    socket.send(JSON.stringify({id,result}));
  }));
  const NativeWebSocket=globalThis.WebSocket;
  const upgrade=vi.fn(async(input:RequestInfo | URL)=>{
    const url=new URL(String(input));
    expect(url.searchParams.has("__vibestudio_ws_headers")).toBe(true);
    url.protocol="ws:";
    const socket=new NativeWebSocket(url);
    await new Promise<void>((resolve,reject)=>{socket.addEventListener("open",()=>resolve(),{once:true});socket.addEventListener("error",reject,{once:true});});
    return {status:101,webSocket:socket} as unknown as Response;
  });
  if(transport==="worker-upgrade"){
    vi.stubGlobal("WebSocketPair",function WorkerWebSocketPair(){});
    vi.stubGlobal("fetch",upgrade);
  }
  const call=vi.fn(async(_target:string,method:unknown)=>method===mainRpcMethods["workerdInspector.listTargets"]?[{targetPath:"/test",title:"test",id:"test",type:"worker"}]:endpoint);
  const workers=createWorkerdClient({call} as never);
  const native=await workers.inspectorSocket("/test");
  expect(call).toHaveBeenCalledWith("main",mainRpcMethods["workerdInspector.getEndpoint"],["/test"]);
  const files=new Map<string,string>();
  const runtime={workers:{...workers,inspectorSocket:async()=>native},rpc:{call},fs:{mkdir:async()=>{},
    writeFile:async(path:string,body:string)=>{files.set(path,body);},readFile:async(path:string)=>{if(!files.has(path))throw new Error("Not found");return files.get(path);}}};
  try {
    const guest=await confinedProgram(runtime);
    let ran=false;
    const result=await guest.profileWorkerd({targetPath:"/test",title:"test",id:"test",type:"worker"},async()=>{ran=true;});
    expect(ran).toBe(true);
    if(transport==="worker-upgrade")expect(upgrade).toHaveBeenCalledOnce();
    expect(methods).toEqual(["Profiler.enable","Profiler.start","Profiler.stop"]);
    expect(result.summary.totalSamples).toBe(1);
    expect(JSON.parse(files.get(result.path)!)).toMatchObject({samples:[1]});
    if(transport==="worker-upgrade"){
      const panel=createCdpAutomation({call} as never,"panel:owned",{loadModule:async()=>guest,
        observe:async()=>({panelId:"panel:owned",title:"Owned",source:"panels/test",parentId:null,contextId:"owned",requestedRef:"main",
          effectiveVersion:"v1",attemptRef:{epoch:"e",attemptId:"a"},updatedAt:1,kind:"workspace",phase:"ready",attemptId:"a",runtimeEntityId:"runtime:owned",buildKey:"build:owned"})});
      const session=await panel.session();
      await session.page;
      await session.close();
      expect(methods).toContain("Page.enable");
      expect(call).toHaveBeenCalledWith("main",mainRpcMethods["panelCdp.getCdpEndpoint"],["panel:owned"],expect.anything());
    }
    await expect(native.openSocket(endpoint.wsEndpoint+"-foreign",endpoint.token)).rejects.toThrow("bound");
    await expect(native.openSocket(endpoint.wsEndpoint,"foreign-grant")).rejects.toThrow("bound");
    await expect(guest.CdpConnection.connect(endpoint.wsEndpoint,endpoint.token,false,{openSocket:native.openSocket,signal:AbortSignal.abort(new Error("cancelled"))})).rejects.toThrow("cancelled");
  } finally {
    for(const socket of server.clients)socket.terminate();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

it("does not expose a transport capability after permission denial",async()=>{
  const call=vi.fn(async()=>{throw new Error("runtime.inspect denied");});
  await expect(createWorkerdClient({call} as never).inspectorSocket("/denied")).rejects.toThrow("runtime.inspect denied");
  expect(call).toHaveBeenCalledTimes(1);
});
