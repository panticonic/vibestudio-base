import type {
  ContractInput,
  ConversationReport,
  ConversationRequest,
  DeliveryInput,
  SurfaceInput,
} from "../conversation-evidence-review/types.js";

function task(
  id: string,
  kind: ConversationReport["kind"],
  request: ConversationRequest,
  basis: string,
  blockers: string[],
) {
  return {
    id: `conversation-${id}`,
    sourceGroup: `vibestudio:conversation-evidence:${kind}`,
    request,
    expected: { kind, basis, blockers, ready: blockers.length === 0 },
  };
}
function delivery(
  id: string,
  goal: string,
  change: Partial<DeliveryInput>,
  blockers: string[],
) {
  const request: DeliveryInput = {
    kind: "delivery",
    goal,
    channelId: `chan-${id}`,
    channelAccepted: true,
    originMatched: true,
    durableCount: 1,
    recipientsResolved: true,
    membershipVerified: true,
    replayMeaningMatches: true,
    settlement: "delivered",
    accountedRetry: true,
    ...change,
  };
  return task(id, "delivery", request, request.channelId, blockers);
}
function surface(
  id: string,
  goal: string,
  change: Partial<SurfaceInput>,
  blockers: string[],
) {
  const request: SurfaceInput = {
    kind: "surface",
    goal,
    channelId: `chan-${id}`,
    assignedContext: "review-22",
    renderedContext: "review-22",
    requiredCapabilityVisible: true,
    targetAgentBound: true,
    userTurnRecorded: true,
    assistantTerminal: "completed",
    observedEffect: true,
    cleanupJoined: true,
    ...change,
  };
  return task(id, "surface", request, request.channelId, blockers);
}
function protocol(
  id: string,
  goal: string,
  change: Partial<ContractInput>,
  blockers: string[],
) {
  const request: ContractInput = {
    kind: "contract",
    goal,
    revision: `rev-${id}`,
    schemaValid: true,
    canonicalHashMatches: true,
    terminalMatches: true,
    privateProjectionBounded: true,
    largeValueStoredByReference: true,
    typedFailures: true,
    retainedHistoryChecked: true,
    consumersChecked: true,
    ...change,
  };
  return task(id, "contract", request, request.revision, blockers);
}
export const conversationEvidenceWorlds = [
  delivery(
    "idempotent-redelivery",
    "The outbox replay delivered the same accepted envelope twice to the reducer, but the log contains exactly one causal entry. Check whether that evidence is acceptable.",
    {},
    [],
  ),
  delivery(
    "advertised-before-acceptance",
    "The payload was dispatched toward a recipient with no accepted log record. Can we call the delivery settled?",
    { channelAccepted: false, durableCount: 0 },
    ["accepted", "durable-count"],
  ),
  delivery(
    "duplicate-accepted-row",
    "After reconnect the same accepted causal envelope was recorded as another durable row. Explain what needs attention.",
    { durableCount: 2 },
    ["durable-count"],
  ),
  delivery(
    "different-origin-coordinates",
    "The replay text and visible author match, but the accepted record has another source origin coordinate.",
    { originMatched: false },
    ["origin"],
  ),
  delivery(
    "replay-payload-drift",
    "The live envelope had the original announcement, but the replay changed the payload semantics instead of phase metadata.",
    { replayMeaningMatches: false },
    ["replay"],
  ),
  delivery(
    "socket-not-membership",
    "A device has a live connection but no verified participant membership receipt.",
    { membershipVerified: false },
    ["membership"],
  ),
  delivery(
    "ambiguous-handle-held",
    "The accepted note resolved its recipient label to two visible participants. What remains open?",
    { recipientsResolved: false, settlement: "pending" },
    ["addressing", "settlement"],
  ),
  delivery(
    "retained-outbox-failure",
    "The persisted envelope survived the failure and its retry is recorded. Review completion without starting another send.",
    { settlement: "failed" },
    ["settlement"],
  ),
  delivery(
    "failed-without-retry-receipt",
    "The candidate logs show an accepted record but no terminal delivery or admitted retry for the failed recipient.",
    { settlement: "failed", accountedRetry: false },
    ["settlement", "outbox"],
  ),
  surface(
    "wrong-context-looks-right",
    "The rendered fixture resembles the assigned design but the panel points to a different workspace context.",
    { renderedContext: "review-98" },
    ["context"],
  ),
  surface(
    "hidden-capability",
    "The installed panel replaced a UI entry while the backing capability the user requested is absent from its model and tool surface.",
    { requiredCapabilityVisible: false },
    ["capability"],
  ),
  surface(
    "not-assigned-agent",
    "The chat is available and shows activity, but the required installed agent was never bound.",
    { targetAgentBound: false },
    ["agent"],
  ),
  surface(
    "empty-opening-row",
    "The conversation was created, but the initial user request never reached its assigned durable turn.",
    { userTurnRecorded: false },
    ["opening"],
  ),
  surface(
    "assistant-failed-terminal",
    "The UI displays a word from a partial turn. The assistant failure is terminal and the desired product effect isn't observed.",
    { assistantTerminal: "failed", observedEffect: false },
    ["terminal", "effect"],
  ),
  surface(
    "cancelled-is-not-completed",
    "The fixture was cancelled and cleanup is still open. Can the passing view alone verify the complete run?",
    { assistantTerminal: "cancelled", cleanupJoined: false },
    ["terminal", "cleanup"],
  ),
  surface(
    "success-without-visible-proof",
    "The response completed, but the browser has no observation of the requested product result.",
    { observedEffect: false },
    ["effect"],
  ),
  surface(
    "exact-context-success",
    "Review an installed chat run with its original assigned state, admitted worker, completed event, independently observed effect and joined cleanup.",
    {},
    [],
  ),
  protocol(
    "validate-only-not-consumers",
    "The new event union validates under a local test, but the actual importing agent and chat consumers were not checked.",
    { consumersChecked: false },
    ["consumers"],
  ),
  protocol(
    "hash-picked-up-display-field",
    "A presentation-only field changed the encoded hash. Review invariant evidence before shipping.",
    { canonicalHashMatches: false },
    ["hash"],
  ),
  protocol(
    "terminal-disagrees-with-event",
    "The retained failure event was interpreted as completed in a protocol migration.",
    { terminalMatches: false },
    ["terminal-kind"],
  ),
  protocol(
    "private-fields-leak-in-projection",
    "Review a consumer response containing participant data outside its authorized projection.",
    { privateProjectionBounded: false },
    ["projection"],
  ),
  protocol(
    "oversized-inline",
    "Inspect a test that retained an oversized event body inline instead of storing it by reference.",
    { largeValueStoredByReference: false },
    ["stored-value"],
  ),
  protocol(
    "prose-only-failure",
    "The tool failure has its rendered prose, but the structured envelope is missing. Verify what needs fixing.",
    { typedFailures: false },
    ["failure-envelope"],
  ),
  protocol(
    "retained-history-not-reduced",
    "The schema and current consumers are green. Representative retained terminal history has not been checked.",
    { retainedHistoryChecked: false },
    ["retained-history"],
  ),
  protocol(
    "unrecognized-event-with-terminal-drift",
    "The persisted event kind is unrecognized and the state projection also rewrites its terminal reason.",
    { schemaValid: false, terminalMatches: false },
    ["schema", "terminal-kind"],
  ),
  protocol(
    "scoped-protocol-ready",
    "Review a coordinated update with canonical encoding, complete consumer checks, and retained-history fixtures.",
    {},
    [],
  ),
];
export type ConversationEvidenceWorld =
  (typeof conversationEvidenceWorlds)[number];
