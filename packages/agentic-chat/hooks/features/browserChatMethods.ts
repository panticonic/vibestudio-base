/**
 * Browser-owned channel methods of the chat panel (inline UI, action bar,
 * card inspection). They render or compile UI in this browser participant, so
 * they register through the session's method-provider port from the React
 * layer; a headless participant does not advertise them. The terminal chat
 * offers its own \`inline_ui\` under the shared definition from
 * \`@workspace/agentic-core/chat-presentation\`.
 */

import { z } from "zod";
import type { MethodDefinition, MethodExecutionContext, PubSubClient } from "@workspace/pubsub";
import {
  INLINE_UI_METHOD_DESCRIPTION,
  inlineUiMethodParameters,
} from "@workspace/agentic-core/chat-presentation";
import type { SandboxImportLoader } from "@workspace/eval";
import {
  AGENTIC_PROTOCOL_VERSION,
  participantRefFromMetadata,
  type AgenticEvent,
  type ParticipantKind,
  type ParticipantRef,
} from "@workspace/agentic-protocol";
import type {
  ChatMessage,
  ChatParticipantMetadata,
  ClientParticipantMetadata,
} from "@workspace/agentic-core";
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
      messageId: z.string().describe("The custom message id (custom.started messageId)"),
    }),
    execute: async (args: unknown, ctx: MethodExecutionContext) => {
      const { messageId } = args as { messageId?: string };
      if (!messageId)
        return ctx.result({ ok: false, error: "Missing messageId" }, { isError: true });
      const snapshot = read();
      const message = snapshot.messages.find((item) => item.custom?.messageId === messageId);
      if (!message?.custom) {
        const known = snapshot.messages
          .filter((item) => item.custom)
          .map((item) => `${item.custom!.typeId}:${item.custom!.messageId}`);
        return ctx.result(
          {
            ok: false,
            error: `No custom message "${messageId}" in this channel view.`,
            knownCards: known,
          },
          { isError: true }
        );
      }
      return {
        ok: true,
        details: customInspectorPayload(
          message.custom,
          snapshot.registry.get(message.custom.typeId)
        ),
      };
    },
  };
}

/** `inline_ui`: render an interactive component inline in the transcript. */
export function inlineUiMethod(runtime: BrowserMethodRuntime): MethodDefinition {
  return {
    description: INLINE_UI_METHOD_DESCRIPTION,
    parameters: inlineUiMethodParameters,
    execute: async (args: unknown, ctx: MethodExecutionContext) => {
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
      const sourceCode = trimmedPath ? await runtime.loadSourceFile(trimmedPath) : code;
      if (!sourceCode) {
        return ctx.result({ ok: false, error: "Missing code or path" }, { isError: true });
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
        }
      );
      if (!validation.ok) {
        return ctx.result({ ...validation, compileError: true }, { isError: true });
      }
      const client = runtime.getClient();
      if (!client) return ctx.result({ ok: false, error: "Not connected" }, { isError: true });
      const id = requestedId?.trim() || crypto.randomUUID();
      const source = trimmedPath
        ? { type: "file" as const, path: trimmedPath }
        : { type: "code" as const, code: code! };
      const eventPayload: AgenticEvent<"ui.inline_rendered">["payload"] = {
        protocol: AGENTIC_PROTOCOL_VERSION,
        uiType: "inline",
        requestedBy: participantRefFromMetadata(
          ctx.callerId,
          client.roster?.[ctx.callerId]?.metadata
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
          ...(ctx.turnId ? { turnId: ctx.turnId as never } : {}),
          payload: eventPayload,
          createdAt: new Date().toISOString(),
        },
        // The component ID is intentionally reusable. Event idempotency
        // remains unique so a later render is reduced as an update.
        {
          idempotencyKey: `ui:inline:${id}:${crypto.randomUUID()}`,
        }
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
          "Inline TSX source with a default-exported component. Provide code or path unless clear is true."
        ),
      path: z
        .string()
        .optional()
        .describe("Context-relative TSX file to load. Provide code or path unless clear is true."),
      imports: z
        .record(z.string(), z.string())
        .optional()
        .describe("On-demand package builds. Same semantics as eval imports."),
      props: z
        .record(z.unknown())
        .optional()
        .describe("Props passed to the component as { props }"),
      maxHeight: z
        .number()
        .optional()
        .describe(
          "Preferred maximum height in pixels. Defaults to 180 and is clamped between 64 and 360."
        ),
      clear: z.boolean().optional().describe("When true, remove the current action bar."),
    }),
    execute: async (args: unknown, ctx: MethodExecutionContext) => {
      const { code, path, imports, props, maxHeight, clear } = args as {
        code?: string;
        path?: string;
        imports?: Record<string, string>;
        props?: Record<string, unknown>;
        maxHeight?: number;
        clear?: boolean;
      };
      const client = runtime.getClient();
      if (!client) return ctx.result({ ok: false, error: "Not connected" }, { isError: true });
      const requestedBy = participantRefFromMetadata(
        ctx.callerId,
        client.roster?.[ctx.callerId]?.metadata
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
          { isError: true }
        );
      const barPath = filePath ?? runtime.managedActionBarPath;
      // Validate before writing: the managed file may back the
      // currently loaded bar, which a compile failure must keep.
      const validation = await validateComponentSource(
        {
          code: inlineCode ?? (await runtime.loadSourceFile(barPath)),
          path: barPath,
        },
        {
          imports,
          loadSourceFile: runtime.loadSourceFile,
          loadImport: runtime.importLoader,
        }
      );
      if (!validation.ok) {
        return ctx.result({ ...validation, compileError: true }, { isError: true });
      }
      if (inlineCode !== undefined) await runtime.writeManagedActionBar(inlineCode);
      const result = await runtime.loadActionBarFromFile({
        path: barPath,
        imports,
        props,
        maxHeight,
        requestedBy,
        turnId: ctx.turnId,
      });
      return result.ok ? result : ctx.result(result, { isError: true });
    },
  };
}
