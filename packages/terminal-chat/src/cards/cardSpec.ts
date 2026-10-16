/** Which transcript messages are cards, and what each one draws. */
import type { ChatMessage } from "@workspace/agentic-core";
import { isMdxMessage } from "@workspace/agentic-core/chat-presentation";
import { rowKind } from "../model/transcript.js";
import type { CardSpec } from "./cardHost.js";
import { registeredMdxComponents } from "./modules.js";

export function cardSpec(msg: ChatMessage, selfId: string | null): CardSpec | null {
  if (msg.contentType === "inline_ui" && msg.inlineUi?.source.type === "code")
    return {
      kind: "inline",
      id: msg.inlineUi.id,
      source: msg.inlineUi.source.code,
      props: msg.inlineUi.props ?? {},
    };
  if (
    rowKind(msg, selfId) === "agent" &&
    msg.complete !== false &&
    !msg.retracted &&
    msg.content &&
    isMdxMessage(msg.content, registeredMdxComponents)
  )
    return { kind: "mdx", content: msg.content };
  return null;
}
