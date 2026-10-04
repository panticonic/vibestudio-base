import {copyJson, type Context, type JsonValue} from '@panticonic/pi-chord';
import {defineDocFamily, type ConversationId, type ToolExecutionApi} from '@panticonic/pi-durable';
import type {AgenticEvent} from '@workspace/agentic-protocol';
import {canonicalJson} from '@vibestudio/shared/canonicalJson';

const Publications = defineDocFamily<{scope: string; event: JsonValue | null}, null>({
  kind: 'vibestudio.subagent-terminal-publication', version: 1,
  scope: 'conversation', family: true, history: 'latest', fork: 'initial',
  initial: () => ({scope: '', event: null}), checkpointWhen: () => true,
});

export interface NativeSubagentTerminalScope {
  readonly operationId: string;
  readonly runId: string;
  readonly parentChannelId: string;
  readonly parentContextId: string;
  readonly childEntityId: string;
  readonly childContextId: string;
  readonly taskChannelId: string;
  readonly senderId: string;
}

/** Retain one original domain fact before dispatch. Its owner still performs
 * publication: this document supplies no scheduler or execution authority. */
export function retainNativeSubagentTerminal(
  port: Pick<ToolExecutionApi, 'commit'>, conversationId: ConversationId,
  scope: NativeSubagentTerminalScope, create: () => AgenticEvent, context: Context,
): Promise<AgenticEvent> {
  if (!scope.operationId || !scope.runId || !scope.parentContextId)
    throw new Error('Subagent terminal publication requires its original owner scope');
  return port.commit(async tx => {
    const document = await tx.doc(Publications, conversationId, scope.operationId, null);
    const binding = canonicalJson(scope);
    if (document.event !== null) {
      if (document.scope !== binding) throw new Error('Subagent terminal publication changed its original resources');
      return copyJson(document.event) as unknown as AgenticEvent;
    }
    document.scope = binding;
    document.event = copyJson(create(), {omitUndefinedProperties: true});
    return copyJson(document.event) as unknown as AgenticEvent;
  }, context);
}
