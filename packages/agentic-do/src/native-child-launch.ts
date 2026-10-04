import { copyJson, type Context, type JsonValue } from "@panticonic/pi-chord";
import type { ToolExecutionApi, ToolExecutionResult } from "@panticonic/pi-durable";

export interface NativeChildLaunchIntent {
  kind: "vibestudio.child-launch";
  conversationId: number;
  taskId: number;
  invocationId: string;
  channelId: string;
  targetKey: string;
  childContextId: string;
  taskChannelId: string;
  prepared: JsonValue;
}

export interface NativeChildLaunchHost {
  prepare(args: unknown, api: ToolExecutionApi, context: Context): Promise<NativeChildLaunchIntent>;
  launch(intent: NativeChildLaunchIntent, api: ToolExecutionApi, context: Context): Promise<ToolExecutionResult>;
  cleanup(intent: NativeChildLaunchIntent, api: ToolExecutionApi, context: Context): Promise<void>;
}

function retainedIntent(value: JsonValue, api: ToolExecutionApi): NativeChildLaunchIntent {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value['kind'] !== 'vibestudio.child-launch' || value['taskId'] !== api.taskId ||
      value['conversationId'] !== api.conversationId ||
      typeof value['invocationId'] !== 'string' || !value['invocationId'] ||
      typeof value['channelId'] !== 'string' || !value['channelId'] ||
      typeof value['targetKey'] !== 'string' || !value['targetKey'] ||
      typeof value['childContextId'] !== 'string' || !value['childContextId'] ||
      typeof value['taskChannelId'] !== 'string' || !value['taskChannelId'] ||
      value['prepared'] === undefined)
    throw new Error('Native child launch lost its original resource admission');
  return value as unknown as NativeChildLaunchIntent;
}

/** One real ToolTask retains its original resources through uncertainty and cleanup. */
export function createNativeChildLaunch(host: NativeChildLaunchHost) {
  return {
    async execute(args: unknown, api: ToolExecutionApi, context: Context): Promise<ToolExecutionResult> {
      let intent: NativeChildLaunchIntent;
      if (api.continuation === undefined) {
        intent = retainedIntent(copyJson(await host.prepare(args, api, context)), api);
        await api.retainContinuation(copyJson(intent), () => {}, context);
      } else intent = retainedIntent(api.continuation, api);
      return host.launch(intent, api, context);
    },
    async cancel(_args: unknown, api: ToolExecutionApi, context: Context): Promise<ToolExecutionResult> {
      if (api.continuation !== undefined)
        await host.cleanup(retainedIntent(api.continuation, api), api, context);
      return {content: []};
    },
  };
}
