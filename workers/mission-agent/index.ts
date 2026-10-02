import { AiChatWorker } from "@workspace-workers/agent-worker";
import {
  rpc,
  createDurableObjectServiceClient,
} from "@workspace/runtime/worker/kernel";
import { Type } from "@panticonic/pi-ai";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { JsonValue } from "@panticonic/pi-chord";
import { copyJson } from "@panticonic/pi-chord";
import type { ToolRegistration } from "@panticonic/pi-durable";
import { authorNativeTool } from "@workspace/harness";
import { PROTOCOL, type Automation } from "@workspace/mission-control";
import { missionCharterSchema } from "@vibestudio/service-schemas/missions";
import { triggerSchema } from "@vibestudio/workspace-contracts/automations";
import { z } from "zod";

const OPERATIONS = [
  "overview",
  "getTask",
  "taskOptions",
  "createProject",
  "updateProject",
  "createTask",
  "updateTask",
  "duplicateTask",
  "addNote",
  "setView",
  "saveView",
  "removeView",
  "taskDetail",
  "startTask",
  "configureAutomation",
  "controlTask",
  "cancelTask",
] as const;
const parameters = Type.Object(
  {
    operation: Type.Union(
      OPERATIONS.map((operation) => Type.Literal(operation)),
    ),
    input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

/** A normal chat vessel with one app-shaped tool; no alternate agent loop. */
export class MissionAgent extends AiChatWorker {
  protected override async getTools(
    channelId: string,
  ): Promise<ToolRegistration[]> {
    const tools = await super.getTools(channelId);
    const missionTool = authorNativeTool(
      (
        execution: AgentToolExecutionContext | undefined,
      ): ToolRegistration<typeof parameters, JsonValue> => ({
        name: "mission_control",
        description: `Manage the Mission Control app. operation and input select one domain operation.
overview: {cursor?,limit?}; taskOptions: {projectId?,query?,cursor?,limit?}; getTask: {id}; taskDetail: {id,cursor?:{startedAt,runId},activityCursor?}; createProject: {name,description?,repos:string[],color?}; updateProject: {id,expectedRevision,changes};
createTask: {projectId,title,description?,status?,priority?,category?,tags?,dependencies?,checklist?:[{id,text,done}],dueAt?:epochMs|null,historyMode?:overview|conversation}; updateTask: {id,expectedRevision,changes} with the same fields; duplicateTask: {id,expectedRevision} copies the plan into an unlinked Inbox card with unchecked checklist; addNote: {id,text};
setView: {projectId?:id|null,query?,statuses?:[inbox|ready|active|review|done|cancelled],priorities?:[urgent|high|normal|low],tag?,category?,due?:any|overdue|today|week|none,timezone?:IANA,execution?:any|linked|unlinked,blocked?:boolean,layout?:board|list|agenda,sort?:priority|updated|due}; saveView: {id?,name,view} (id updates/renames an existing view); removeView: {id};
startTask/cancelTask: {id,expectedRevision}; configureAutomation: {id,expectedRevision,trigger:{kind:manual}|{kind:schedule,everyMs}|{kind:cron,expression,timezone}}; controlTask: {id,action:pause|resume}.
Always read before editing, preserve independent fields, and report original failures. startTask preserves recurrence; pause stops future ticks; cancelTask interrupts active execution. Run history is canonical, card status is the user's work state.`,
        parameters,
        execute: async (args) => {
          const operation: (typeof OPERATIONS)[number] = z
            .enum(OPERATIONS)
            .parse(args.operation);
          const service = createDurableObjectServiceClient(
            execution?.rpc ?? this.rpc,
            PROTOCOL,
          );
          const result = await service.call(operation, args.input ?? {});
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(result ?? null) },
            ],
            details: copyJson(result ?? null, {
              omitUndefinedProperties: true,
            }),
          };
        },
      }),
      (api, context) => this.bindNativeToolExecution(api, context),
    );
    return [...tools, missionTool];
  }

  /** Seal this installed vessel's image through the canonical automation owner. */
  @rpc({
    website: {
      kind: "closed",
      reason: "Task execution is installed workspace code.",
    },
    principals: ["user", "code", "session"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async installTaskAutomation(input: unknown): Promise<Automation> {
    const parsed = z
      .object({
        taskId: z.string().min(1),
        name: z.string().min(1).max(200),
        prompt: z.string().min(1).max(24000),
        trigger: triggerSchema,
        automationId: z.string().nullable(),
      })
      .strict()
      .parse(input);
    const charter = missionCharterSchema.parse({
      summary: `Execute Mission Control task ${parsed.taskId}`,
      execution: {
        kind: "agent",
        image: {
          source: this.env["WORKER_SOURCE"],
          ref: this.env["WORKER_SOURCE_REF"],
          effectiveVersion: this.env["WORKER_EFFECTIVE_VERSION"],
          className: "MissionAgent",
          objectKey: this.objectKey,
        },
        action: { kind: "prompt", text: parsed.prompt },
        conversation: { mode: "fresh" },
        operations: [],
      },
      trigger: parsed.trigger,
    });
    const missions = createDurableObjectServiceClient(
      this.rpc,
      "vibestudio.missions.v1",
    );
    const defaultId = `mission-control-task:${parsed.taskId}`;
    const installed = parsed.automationId
      ? await missions.call<
          Automation & { charter: z.infer<typeof missionCharterSchema> }
        >("get", parsed.automationId)
      : await missions.call<
          | (Automation & { charter: z.infer<typeof missionCharterSchema> })
          | null
        >("getDefault", defaultId);
    if (!installed)
      return missions.call<Automation>("provisionDefault", defaultId, {
        name: parsed.name,
        charter,
      });
    const current = installed;
    if (!current || current.state === "retired")
      throw new Error(
        "This task's automation was removed; its historical runs remain available.",
      );
    if (JSON.stringify(current.charter) === JSON.stringify(charter))
      return current;
    return missions.call<Automation>("edit", current.missionId, {
      name: parsed.name,
      charter,
    });
  }
}

export default {
  fetch() {
    return new Response("Mission Control agent");
  },
};
