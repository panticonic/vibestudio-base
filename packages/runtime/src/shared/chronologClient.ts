import type { RpcClient } from "@vibestudio/rpc";
import {
  createMainRpcCaller,
  mainRpcMethods,
  type MainRpcMethods,
} from "@vibestudio/service-schemas/mainRpc";

export interface ChronologClient {
  readonly groups: {
    readonly identity: MainRpcMethods["chronolog.groups.identity"];
    readonly list: MainRpcMethods["chronolog.groups.list"];
    readonly create: MainRpcMethods["chronolog.groups.create"];
    readonly invite: MainRpcMethods["chronolog.groups.invite"];
    readonly join: MainRpcMethods["chronolog.groups.join"];
  };
  readonly history: {
    readonly current: MainRpcMethods["chronolog.history.current"];
    readonly share: MainRpcMethods["chronolog.history.share"];
    readonly publish: MainRpcMethods["chronolog.history.publish"];
  };
  readonly transact: MainRpcMethods["chronolog.transact"];
  readonly outcome: MainRpcMethods["chronolog.outcome"];
  readonly query: MainRpcMethods["chronolog.query"];
  subscribe(
    input: Parameters<MainRpcMethods["chronolog.subscribe"]>[0],
    options?: { signal?: AbortSignal }
  ): Promise<Response>;
}

export function createChronologClient(rpc: RpcClient): ChronologClient {
  const call = createMainRpcCaller(rpc);
  return {
    groups: {
      identity: () => call("chronolog.groups.identity", []),
      list: () => call("chronolog.groups.list", []),
      create: (input) => call("chronolog.groups.create", [input]),
      invite: (input) => call("chronolog.groups.invite", [input]),
      join: (input) => call("chronolog.groups.join", [input]),
    },
    history: {
      current: (input) => call("chronolog.history.current", [input]),
      share: (input) => call("chronolog.history.share", [input]),
      publish: (input) => call("chronolog.history.publish", [input]),
    },
    transact: (input) => call("chronolog.transact", [input]),
    outcome: (input) => call("chronolog.outcome", [input]),
    query: (input) => call("chronolog.query", [input]),
    subscribe: (input, options) =>
      rpc.stream("main", mainRpcMethods["chronolog.subscribe"], [input], options),
  };
}
