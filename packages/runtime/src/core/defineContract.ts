import type { RpcMethodMap, RpcMethodArgs, RpcMethodResult } from "@vibestudio/shared/rpcMethods";
import type { PanelContract, EventSchemaMap } from "./types.js";
type Callable<M extends RpcMethodMap> = { [K in keyof M]: (...args: RpcMethodArgs<M[K]>) => Promise<RpcMethodResult<M[K]>> };
/** Both panels share the receiver's real descriptors and event schemas. */
export function defineContract<Child extends RpcMethodMap = {}, ChildEmits extends EventSchemaMap = {}, Parent extends RpcMethodMap = {}, ParentEmits extends EventSchemaMap = {}>(contract: {
  source: string;
  child?: { methods?: Child; emits?: ChildEmits };
  parent?: { methods?: Parent; emits?: ParentEmits };
}): PanelContract<Callable<Child>, ChildEmits, Callable<Parent>, ParentEmits> {
  return contract as PanelContract<Callable<Child>, ChildEmits, Callable<Parent>, ParentEmits>;
}
