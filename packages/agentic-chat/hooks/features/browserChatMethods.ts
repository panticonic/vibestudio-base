/**
 * Browser-owned channel methods of the chat panel (inline UI, action bar,
 * card inspection). They render or compile UI in this browser participant, so
 * they register through the session's method-provider port from the React
 * layer; a headless or terminal participant simply does not advertise them.
 */

import { z } from "zod";
import type { MethodDefinition, MethodExecutionContext, PubSubClient } from "@workspace/pubsub";
import type { SandboxImportLoader } from "@workspace/eval";
import {
  AGENTIC_PROTOCOL_VERSION,
  participantRefFromMetadata,
  type AgenticEvent,
  type ParticipantKind,
  type ParticipantRef,
} from "@workspace/agentic-protocol";
import type { ChatMessage, ChatParticipantMetadata, ClientParticipantMetadata } from "@workspace/agentic-core";
import { customInspectorPayload } from "../../components/CustomMessage";
import type { MessageTypeComponentEntry } from "../../types";
import { validateComponentSource } from "./validateComponentSource";

function actorKindFromMetadata(type: string | undefined, participantId?: string): ParticipantKind {
  // A `user:<userId>` participant id is the channel-stamped human identity
  // (WP6 §4) — it always resolves to the semantic `user` role.
  if (participantId?.startsWith("user:")) return "user";
  if (type === "agent" || type === "system" || type === "panel" || type === "external") return type;
  return "user";
}

/** The actor this browser participant publishes UI events as. */
export function actorForClient(
  client: Pick<PubSubClient<ChatParticipantMetadata>, "clientId" | "roster">,
  metadata: ClientParticipantMetadata
) {
  const id = client.clientId ?? metadata.handle ?? "panel";
  // Live identity projection (WP6 §3/§5): prefer the channel-stamped roster
  // row (account handle/displayName) over the local panel label.
  const self = client.roster?.[id]?.metadata;
  const merged = { ...metadata, ...(self ?? {}) };
  return {
    kind: actorKindFromMetadata(merged.type ?? metadata.type, id),
    id,
    displayName: merged.name ?? merged.handle ?? id,
    metadata: { ...merged },
  };
}

/** What the browser methods need from the panel at execution time. */
export interface BrowserMethodRuntime {
  getClient(): PubSubClient<ChatParticipantMetadata> | null;
  metadata: ClientParticipantMetadata;
  importLoader?: SandboxImportLoader;
  loadSourceFile(path: string): Promise<string>;
  publishTypedAgenticEvent(
    event: AgenticEvent,
    options?: { idempotencyKey?: string }
  ): Promise<number | undefined>;
  managedActionBarPath: string;
  writeManagedActionBar(code: string): Promise<string>;
  loadActionBarFromFile(args: {
    path: string;
    props?: Record<string, unknown>;
    maxHeight?: number;
    imports?: Record<string, string>;
    requestedBy?: ParticipantRef;
    turnId?: string;
  }): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  clearActionBar(args: { requestedBy?: ParticipantRef; turnId?: string }): Promise<void>;
}

/** `inspect_card`: agents debug a card from the same data "Copy details" shows. */
export function inspectCardMethod(
  read: () => { messages: ChatMessage[]; registry: Map<string, MessageTypeComponentEntry> }
): MethodDefinition {
  return {
                description:
                  "Inspect a custom message card in this conversation: wire payload, renderer registry status " +
                  "(ready / load stage / error), definition metadata, and full update history. Use this when a " +
                  "card you published is not rendering, looks wrong, or a user reports a stuck spinner — it " +
                  "returns exactly what the user's 'Copy details' button shows. Parameters: { messageId: string }.",
                parameters: z.object({
                  messageId: z
                    .string()
                    .describe(
                      "The custom message id (custom.started messageId)",
                    ),
                }),
                execute: async (args: unknown, ctx: MethodExecutionContext) => {
                  const { messageId } = args as { messageId?: string };
                  if (!messageId)
                    return ctx.result(
                      { ok: false, error: "Missing messageId" },
                      { isError: true },
                    );
                  const snapshot = read();
                  const message = snapshot.messages.find(
                    (item) => item.custom?.messageId === messageId,
                  );
                  if (!message?.custom) {
                    const known = snapshot.messages
                      .filter((item) => item.custom)
                      .map(
                        (item) =>
                          `${item.custom!.typeId}:${item.custom!.messageId}`,
                      );
                    return ctx.result(
                      {
                        ok: false,
                        error: `No custom message "${messageId}" in this channel view.`,
                        knownCards: known,
                      },
                      { isError: true },
                    );
                  }
                  return {
                    ok: true,
                    details: customInspectorPayload(
                      message.custom,
                      snapshot.registry.get(message.custom.typeId),
                    ),
                  };
                },
              };
}

/** `inline_ui`: render an interactive component inline in the transcript. */
export function inlineUiMethod(runtime: BrowserMethodRuntime): MethodDefinition {
  return {
                    description: `Render an interactive UI component inline in the chat transcript. Non-blocking: it returns immediately and the user interacts whenever they choose.

**When to use:** whenever a visual or interactive answer serves the user better than prose — the user does not need to ask for UI. Reach for it for plans and itineraries, comparisons, data the user will explore, calculators and what-if tools, checklists and multi-step setup, dashboards, and anything the user may come back to. For presentation and local interaction — response components, or a one-off component with its own state defined in the message — write MDX in your message instead. Use inline_ui for a durable surface: refreshed under a stable id, calling workspace services or runtime APIs, or something the user returns to.

**Contrast with other tools:**
- \`eval\`: agent-triggered side effects; runs immediately and returns a result.
- \`inline_ui\`: rich presentation plus user-triggered side effects; persists in the transcript.
- \`ask_user\` / \`feedback_form\` / \`feedback_custom\`: block until the user answers and return the answer to you.

**Fastest path — response components** from \`@workspace/react\`: \`Chart\`, \`Stats\`, \`Compare\`, \`Timeline\`, \`Checklist\`, \`PlaceMap\`, \`Choices\`, \`Calculator\`, \`ActionButton\`, \`Image\`, \`Video\`. Fill them with props; compose them with Radix layout. Read \`skills/visualize/COMPONENTS.md\` for their props.

**The component receives { props, chat, scope, scopes, inlineUi }:**
- props: data you pass via the props parameter
- inlineUi: stable identity \`{ id, renderedAt }\`; \`renderedAt\` changes whenever the same ID is rendered again and can trigger a data-refresh effect
- chat:
  - chat.send(content, { metadata: { interaction: { source, kind, action, targetId } } }) — send a user message that starts a new agent turn; the structured \`interaction\` tells you exactly which control was used. Response components such as \`Choices\` and \`ActionButton\` do this for you.
  - chat.rpc.call(target, methodDescriptor, args) — call a runtime service with its receiver-owned descriptor and complete positional argument array. For host methods, import \`mainRpcMethods\` from \`@vibestudio/service-schemas/mainRpc\`; for example, chat.rpc.call("main", mainRpcMethods["fs.readFile"], ["/src/config.ts"]).
  - chat.publish(type, payload, options?) — publish a typed non-message event.
  - chat.contextId, chat.channelId — current identifiers
- scope: panel-local durable UI state shared by inline_ui, feedback_custom, and the action bar in this panel instance. Serializable values persist in localStorage across panel reloads; nonserializable values are live-only and dropped on restore.
- scopes: scopes.save(), scopes.push(), scopes.list(), scopes.get(id)

**Lifecycle:** The card starts expanded and auto-collapses above 400px; users can expand or collapse it. Pass a stable \`id\` for one evolving surface: a later render by the same participant with that ID replaces the card and moves it to the newest position. Omit \`id\` for a new independent card. **Result:** \`{ ok: true, id }\` means the source compiled and the card was published. A compile failure (syntax error, unresolved import) is returned directly as an error result \`{ ok: false, error, compileError: true }\` with the compiler message, and nothing is rendered; fix the source and call again. Render-time and props failures happen after publishing: a ui-feedback note naming the inline UI id and the error starts a repair turn when you are idle, or follows your current turn (failures of what you publish in a repair turn wait for your next turn); fix the source and render again with the same id.

**Imports:** react, @radix-ui/themes, @radix-ui/react-icons, @workspace/react, @workspace/runtime. Provide either \`code\` or \`path\`; \`path\` reads a context-relative TSX file, supports static relative imports, and infers bare package imports from the nearest package.json. Use \`imports\` for explicit package versions.
**Must use** \`export default\`. Root with an unframed layout that stays usable at a 320px card width.

**Example:**
\`\`\`tsx
import { Flex } from "@radix-ui/themes";
import { Chart, Choices, Stats } from "@workspace/react";

export default function Spending({ props }) {
  return (
    <Flex direction="column" gap="3" p="2" style={{ width: "100%", minWidth: 0 }}>
      <Stats items={[{ label: "Total", value: props.total }, { label: "vs. last month", value: props.delta, tone: "negative" }]} />
      <Chart type="bar" data={props.months} x="month" y={["groceries", "dining"]} valueFormat="currency" stacked />
      <Choices id="spending-next" question="What should we look at next?" options={[{ label: "Cut dining costs" }, { label: "Set a monthly budget" }]} />
    </Flex>
  );
}
\`\`\``,
                    parameters: z.object({
                      id: z
                        .string()
                        .trim()
                        .min(1)
                        .optional()
                        .describe(
                          "Stable component ID. Reusing it updates and bumps the existing card; omit it to create a new card.",
                        ),
                      code: z
                        .string()
                        .optional()
                        .describe(
                          "TSX source code for the component. Provide either code or path.",
                        ),
                      path: z
                        .string()
                        .optional()
                        .describe(
                          "Context-relative TSX file to render instead of inline code. Supports static relative imports.",
                        ),
                      imports: z
                        .record(z.string(), z.string())
                        .optional()
                        .describe(
                          "On-demand package builds. Same semantics as eval imports.",
                        ),
                      props: z
                        .record(z.unknown())
                        .optional()
                        .describe("Props passed to the component as { props }"),
                    }),
                    execute: async (
                      args: unknown,
                      ctx: MethodExecutionContext,
                    ) => {
                      const {
                        id: requestedId,
                        code,
                        path,
                        imports,
                        props,
                      } = args as {
                        id?: string;
                        code?: string;
                        path?: string;
                        imports?: Record<string, string>;
                        props?: Record<string, unknown>;
                      };
                      const trimmedPath = path?.trim();
                      const sourceCode = trimmedPath
                        ? await runtime.loadSourceFile(trimmedPath)
                        : code;
                      if (!sourceCode) {
                        return ctx.result(
                          { ok: false, error: "Missing code or path" },
                          { isError: true },
                        );
                      }
                      const validation = await validateComponentSource(
                        {
                          code: sourceCode,
                          ...(trimmedPath ? { path: trimmedPath } : {}),
                        },
                        {
                          imports,
                          loadSourceFile: runtime.loadSourceFile,
                          loadImport: runtime.importLoader,
                        },
                      );
                      if (!validation.ok) {
                        return ctx.result(
                          { ...validation, compileError: true },
                          { isError: true },
                        );
                      }
                      const client = runtime.getClient();
                      if (!client)
                        return ctx.result(
                          { ok: false, error: "Not connected" },
                          { isError: true },
                        );
                      const id = requestedId?.trim() || crypto.randomUUID();
                      const source = trimmedPath
                        ? { type: "file" as const, path: trimmedPath }
                        : { type: "code" as const, code: code! };
                      const eventPayload: AgenticEvent<"ui.inline_rendered">["payload"] =
                        {
                          protocol: AGENTIC_PROTOCOL_VERSION,
                          uiType: "inline",
                          requestedBy: participantRefFromMetadata(
                            ctx.callerId,
                            client.roster?.[ctx.callerId]?.metadata,
                          ),
                          id,
                          source,
                        };
                      if (imports !== undefined) eventPayload.imports = imports;
                      if (props !== undefined) eventPayload.props = props;
                      await runtime.publishTypedAgenticEvent(
                        {
                          kind: "ui.inline_rendered",
                          actor: actorForClient(client, runtime.metadata),
                          ...(ctx.turnId
                            ? { turnId: ctx.turnId as never }
                            : {}),
                          payload: eventPayload,
                          createdAt: new Date().toISOString(),
                        },
                        // The component ID is intentionally reusable. Event idempotency
                        // remains unique so a later render is reduced as an update.
                        {
                          idempotencyKey: `ui:inline:${id}:${crypto.randomUUID()}`,
                        },
                      );
                      return { ok: true, id };
                    },
                  };
}

/** `load_action_bar`: load, replace, or clear the panel-local action bar. */
export function loadActionBarMethod(runtime: BrowserMethodRuntime): MethodDefinition {
  return {
                    description: `Load, replace, or clear a compact persistent action bar at the top of this chat panel.

Use this for small always-available controls or status for the current workflow.
Pass exactly one source: \`code\` (inline TSX) or \`path\` (a context-relative TSX
file in this panel's current filesystem context, e.g. a checked-in repo file).
Inline code is written to a scratch file this panel owns and persists, so the bar
survives panel reloads; do not create, track, or delete a file for it.
The loaded component receives { props, chat, scope, scopes }, supports the same
imports as inline_ui, and must export default. A \`path\` source also supports
static relative imports from the loaded file and infers bare package imports from
the nearest package.json when possible.

Unlike inline_ui, load_action_bar does not add visible chat history. The latest
loaded file replaces any previous action bar for this panel only. Other panels
connected to this channel may be in different filesystem contexts.
Keep it compact; the panel clamps the rendered height to a small scrollable area.

Result: \`{ ok: true, id }\` means the source compiled and the bar was loaded. A compile failure (syntax error, unresolved import) is returned directly as an error result \`{ ok: false, error, compileError: true }\` and the current bar is left unchanged. Render-time and props failures arrive afterward as ui-feedback notes: one starts a repair turn when you are idle, or follows your current turn.`,
                    parameters: z.object({
                      code: z
                        .string()
                        .optional()
                        .describe(
                          "Inline TSX source with a default-exported component. Provide code or path unless clear is true.",
                        ),
                      path: z
                        .string()
                        .optional()
                        .describe(
                          "Context-relative TSX file to load. Provide code or path unless clear is true.",
                        ),
                      imports: z
                        .record(z.string(), z.string())
                        .optional()
                        .describe(
                          "On-demand package builds. Same semantics as eval imports.",
                        ),
                      props: z
                        .record(z.unknown())
                        .optional()
                        .describe("Props passed to the component as { props }"),
                      maxHeight: z
                        .number()
                        .optional()
                        .describe(
                          "Preferred maximum height in pixels. Defaults to 180 and is clamped between 64 and 360.",
                        ),
                      clear: z
                        .boolean()
                        .optional()
                        .describe("When true, remove the current action bar."),
                    }),
                    execute: async (
                      args: unknown,
                      ctx: MethodExecutionContext,
                    ) => {
                      const { code, path, imports, props, maxHeight, clear } =
                        args as {
                          code?: string;
                          path?: string;
                          imports?: Record<string, string>;
                          props?: Record<string, unknown>;
                          maxHeight?: number;
                          clear?: boolean;
                        };
                      const client = runtime.getClient();
                      if (!client)
                        return ctx.result(
                          { ok: false, error: "Not connected" },
                          { isError: true },
                        );
                      const requestedBy = participantRefFromMetadata(
                        ctx.callerId,
                        client.roster?.[ctx.callerId]?.metadata,
                      );
                      if (clear) {
                        await runtime.clearActionBar({
                          requestedBy,
                          turnId: ctx.turnId,
                        });
                        return { ok: true, cleared: true };
                      }
                      const inlineCode = code?.trim() ? code : undefined;
                      const filePath = path?.trim();
                      if ((inlineCode === undefined) === !filePath)
                        return ctx.result(
                          {
                            ok: false,
                            error: "Provide exactly one of code or path",
                          },
                          { isError: true },
                        );
                      const barPath =
                        filePath ?? runtime.managedActionBarPath;
                      // Validate before writing: the managed file may back the
                      // currently loaded bar, which a compile failure must keep.
                      const validation = await validateComponentSource(
                        {
                          code:
                            inlineCode ??
                            (await runtime.loadSourceFile(barPath)),
                          path: barPath,
                        },
                        {
                          imports,
                          loadSourceFile: runtime.loadSourceFile,
                          loadImport: runtime.importLoader,
                        },
                      );
                      if (!validation.ok) {
                        return ctx.result(
                          { ...validation, compileError: true },
                          { isError: true },
                        );
                      }
                      if (inlineCode !== undefined)
                        await runtime.writeManagedActionBar(inlineCode);
                      const result = await runtime.loadActionBarFromFile({
                        path: barPath,
                        imports,
                        props,
                        maxHeight,
                        requestedBy,
                        turnId: ctx.turnId,
                      });
                      return result.ok
                        ? result
                        : ctx.result(result, { isError: true });
                    },
                  };
}
