type Eligibility = {
  state: "ready" | "startable" | "downloading";
  toolsCapable: boolean;
  contextWindow: number;
};

function authored(
  name: string,
  purpose: string,
  inventory: Eligibility,
  disposition: string,
  attach: boolean,
) {
  const modelRef = "local:lfm3-1.7b";
  const goal = `${purpose} Attach the review worker only after the selected local model can run tools with a context window of at least 8192 tokens.`;
  return {
    id: `local-reviewer-${name}`,
    sourceGroups: [
      "vibestudio:agents:initial-attach",
      "vibestudio:local-model-task:agent-readiness",
      "vibestudio:combined:local-reviewer",
    ],
    request: {
      goal,
      work: [
        {
          kind: "domain",
          domain: "channelAgent",
          operation: "manageChannelAgent",
          input: {
            goal: "Add the direct-mention review worker on the selected model, with replay disabled.",
            channelId: `chat-local-review-${name}`,
            contextId: `ctx-local-review-${name}`,
            handle: "reviewer",
            action: "attach",
            options: { replay: false, response: "mentioned-strict", modelRef },
          },
        },
        {
          kind: "domain",
          domain: "localModel",
          operation: "prepareLocalModel",
          input: {
            goal: "Confirm the exact selected model can support the assigned review work.",
            modelRef,
            operation: "delegate",
            mayInstall: false,
            needsTools: true,
            minimumContext: 8192,
            requiresPriorConversation: false,
          },
        },
      ] as const,
    },
    inventory: {
      ...inventory,
      ref: modelRef,
      fit: "full-gpu",
      progress: null,
      errorMessage: null,
    },
    expected: { disposition, attach },
  };
}

export const localReviewerWorlds = [
  authored(
    "accept-ready",
    "Put a local reviewer in the planning conversation.",
    { state: "ready", toolsCapable: true, contextWindow: 16384 },
    "ready-to-delegate",
    true,
  ),
  authored(
    "accept-startable",
    "Prepare an offline reviewer for a staging workspace.",
    { state: "startable", toolsCapable: true, contextWindow: 8192 },
    "ready-to-delegate",
    true,
  ),
  authored(
    "hold-download",
    "Keep the channel usable while a download is in progress.",
    { state: "downloading", toolsCapable: true, contextWindow: 16384 },
    "wait-for-progress",
    false,
  ),
  authored(
    "hold-tools",
    "Add a reviewer for structured issue triage.",
    { state: "ready", toolsCapable: false, contextWindow: 16384 },
    "unsupported-tools",
    false,
  ),
  authored(
    "hold-context",
    "Use local inference for a long shared project review.",
    { state: "ready", toolsCapable: true, contextWindow: 4096 },
    "context-too-small",
    false,
  ),
];
