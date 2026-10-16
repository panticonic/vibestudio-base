/**
 * The \`inline_ui\` channel method as every chat client offers it: one
 * description and one parameter schema, so an agent sees one tool whichever
 * clients are connected. Each client supplies its own execution.
 */
import { z } from "zod";

export const INLINE_UI_METHOD_DESCRIPTION = `Render an interactive UI component inline in the chat transcript. Non-blocking: it returns immediately and the user interacts whenever they choose.

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
- scope: client-local durable UI state shared by inline_ui, feedback_custom, and the action bar in this client (a panel instance, or a terminal chat session). Serializable values persist across reloads; nonserializable values are live-only and dropped on restore.
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
\`\`\`

**In the terminal chat** the same source draws with Ink in text cells: \`@radix-ui/themes\`, \`@workspace/react\` and \`@radix-ui/react-icons\` resolve to a terminal kit with the same names, HTML elements map to it, and CSS/\`style\` is ignored. Charts draw as text; maps, images, video and diagrams become links or source. See \`skills/sandbox/TERMINAL_CARDS.md\`.`;

export const inlineUiMethodParameters = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Stable component ID. Reusing it updates and bumps the existing card; omit it to create a new card."
    ),
  code: z
    .string()
    .optional()
    .describe("TSX source code for the component. Provide either code or path."),
  path: z
    .string()
    .optional()
    .describe(
      "Context-relative TSX file to render instead of inline code. Supports static relative imports."
    ),
  imports: z
    .record(z.string(), z.string())
    .optional()
    .describe("On-demand package builds. Same semantics as eval imports."),
  props: z.record(z.unknown()).optional().describe("Props passed to the component as { props }"),
});

export type InlineUiMethodArgs = z.infer<typeof inlineUiMethodParameters>;
