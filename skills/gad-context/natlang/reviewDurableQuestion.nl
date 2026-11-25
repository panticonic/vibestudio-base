---
description: Resolve the user's durable conversation question and any participant condition they actually requested.
args:
  goal: string
returns: DurableQuestionReport
---
Return an answer to the supplied goal grounded in the conversation's actual durable evidence. Compose the available question and participant reviews according to what the user requested and what those reviews establish. Your computation owns the interpretation and combination; the native readers own evidence acquisition.

Preserve the exact history receipt, channel and question finding obtained from the question review. Distinguish a current actionable question from an incomplete history, a withdrawn or settled request, and a conversation with no actual question. Do not invent a question from a quotation or a status update.

Review participant membership when the user requests it. When that request is conditional on an actionable question, an established absence of that question does not itself require a roster read. If participant membership was not requested under the established conditions, use participant {status: "not-requested", member: null} and rosterReceipt null; this says nothing about whether a person is present. Otherwise preserve the actual roster receipt and exact participant judgment, including incomplete, inactive or ambiguous evidence. Do not claim absence or confirmation without the relevant native evidence.

The disposition and explanation must describe what remains actionable for this goal. A current question is ready only if all participant conditions the user actually imposed are established; an unmet or unestablished required condition is a hold. An absent, withdrawn or settled question is not an actionable handoff even when a person remains present. Return the requested findings without sending a message or changing the conversation.
