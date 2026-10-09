/**
 * Model-facing text for `ui.feedback` events targeting this agent (render
 * failures, invalid card state, expired method calls, …).
 *
 * Admission (deduplication, and whether a note wakes the agent with a repair
 * turn or waits for its next turn) is owned by the native channel session; see
 * `feedbackRepairAdmission` in `native-channel-session.ts`.
 */

import type { UiFeedbackPayload } from "@workspace/agentic-protocol";

export function formatFeedbackNote(payload: UiFeedbackPayload): string {
  const refs = payload.refs ?? {};
  const where = [
    refs.typeId ? `type ${refs.typeId}` : null,
    refs.inlineUiId ? `inline UI ${refs.inlineUiId}` : null,
    refs.actionBarId ? `action bar ${refs.actionBarId}` : null,
    refs.messageId && !refs.inlineUiId && !refs.actionBarId
      ? `${refs.typeId ? "card" : "message"} ${refs.messageId}`
      : null,
    refs.callId ? `call ${refs.callId}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (payload.category === "props_invalid") {
    const subject = refs.inlineUiId
      ? `inline UI ${refs.inlineUiId}`
      : refs.actionBarId
        ? `action bar ${refs.actionBarId}`
        : `message ${refs.messageId ?? "(unknown)"}`;
    const component = refs.component ?? "A component";
    const remedy = refs.inlineUiId
      ? `Fix the props and call inline_ui again with the same id "${refs.inlineUiId}"; the user sees a notice instead of the component.`
      : refs.actionBarId
        ? "Fix the props and call load_action_bar again; the user sees a notice instead of the component."
        : "The user sees a notice instead of the component. Re-send the message with corrected props.";
    return [
      `[ui-feedback] ${component} in ${subject} rejected props: ${payload.error.message}`,
      remedy,
    ].join("\n");
  }
  const category =
    payload.category === "render_failed"
      ? "A UI component you published failed to render"
      : payload.category === "compile_failed"
        ? "UI source you authored failed to compile"
        : payload.category === "state_invalid"
          ? "A card you published has state that fails its registered schema"
          : payload.category === "type_not_registered"
            ? "A card you published references an unregistered message type"
            : payload.category === "method_call_failed"
              ? "A method call you were handling failed or expired"
              : payload.category === "load_stalled"
                ? "A card you published is stuck loading in the panel (its renderer never compiled)"
                : "A suspended wait timed out";
  const remedy = refs.inlineUiId
    ? `Fix the source and call inline_ui again with the same id "${refs.inlineUiId}" to replace the broken component; do not ignore this.`
    : refs.actionBarId
      ? "Fix the source and call load_action_bar again to replace the broken component; do not ignore this."
    : refs.messageId && !refs.typeId
      ? "The user sees your message as plain markdown/text instead. Re-send it with valid MDX (or drop the JSX components); do not ignore this."
      : "Fix the underlying problem or tell the user what went wrong; do not ignore this.";
  return [
    `[ui-feedback] ${category}${where ? ` (${where})` : ""}.`,
    `Error: ${payload.error.message}`,
    remedy,
  ].join("\n");
}

/**
 * Model input of a feedback repair: a UI notice from the chat panel about the
 * agent's own visibly failing output. It is not a user message and is never
 * published to the channel as one.
 */
export function formatFeedbackRepairInput(notes: readonly string[]): string {
  return [
    "[ui-feedback] Automatic notice from the chat panel, not a message from the user: UI you published is failing where the user can see it. Repair it now, or briefly tell the user what went wrong. Failures of what you publish while repairing are not reported until the next turn.",
    ...notes,
  ].join("\n\n");
}
