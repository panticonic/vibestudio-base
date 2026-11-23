import { gad } from "@workspace/runtime";
import { logIdForChannel } from "@vibestudio/trajectory-identity";
import { listFindings, nextInspector } from "./agent-health.js";
import { summarizeChannel } from "./channel-summary.js";
import type {
  ChannelFollowUp,
  ChannelHealth,
  ChannelReviewRequest,
  ChannelTail,
} from "./natlang/types.js";
import type { ChannelRef } from "./types.js";

function scopedInspector(kind: string) {
  const inspector = nextInspector(kind);
  return inspector === "inspectPublicationIntegrity" ||
    inspector === "inspectTurnState" ||
    inspector === "inspectChannelRoster"
    ? inspector
    : null;
}

/** Make one review of a caller-owned channel, with no model-selected channel or branch. */
export function bindChannelReview(
  assignment: ChannelRef & Pick<ChannelReviewRequest, "goal" | "view">,
) {
  const { channelId, branchId, goal, view } = assignment;
  const operationId = crypto.randomUUID();
  const receipt = (stage: string) => `${operationId}:${stage}`;
  const coordinate: ChannelRef = {
    channelId,
    ...(branchId === undefined ? {} : { branchId }),
  };
  const issuedHealth = new Map<string, ChannelHealth>();

  function claim(id: string, permitted: boolean) {
    if (!permitted || id !== operationId)
      throw new Error(
        "Read the assigned channel through its selected review",
      );
  }

  const request: ChannelReviewRequest = { goal, view, operationId };
  return {
    request,
    services: {
      gadHealth: {
        async observe(id: string): Promise<ChannelHealth> {
          claim(id, view !== "recap");
          const snapshot = await gad.inspectAgentHealth({
            ...coordinate,
            limit: 12,
          });
          if (
            snapshot.channelId !== channelId ||
            (branchId !== undefined && snapshot.branchId !== branchId)
          )
            throw new Error(
              "GAD returned health for a different channel or branch",
            );
          const health: ChannelHealth = {
            receipt: receipt("health") + ":" + crypto.randomUUID(),
            channelId,
            branchId: snapshot.branchId,
            generatedAt: snapshot.generatedAt,
            integrity: snapshot.summary.durableIntegrityOk ? "ok" : "broken",
            activity: snapshot.summary.activity,
            findings: listFindings(snapshot).map((finding) => ({
              ...finding,
              inspector: scopedInspector(finding.kind),
            })),
          };
          issuedHealth.set(health.receipt, structuredClone(health));
          return structuredClone(health);
        },
      },
      gadFollowUp: {
        async inspect(
          healthReceipt: string,
          kind: string,
        ): Promise<ChannelFollowUp> {
          const health = issuedHealth.get(healthReceipt);
          if (
            view !== "triage" ||
            !health ||
            healthReceipt !== health.receipt
          )
            throw new Error(
              "Follow up on the assigned channel health receipt",
            );
          const inspector = scopedInspector(kind);
          if (
            !inspector ||
            !health.findings.some((finding) => finding.kind === kind)
          )
            throw new Error("Use an inspector for an observed finding");
          const input = { channelId, branchId: health.branchId, limit: 12 };
          const observation =
            inspector === "inspectChannelRoster"
              ? await gad.inspectChannelRoster({
                  channelId,
                  limit: input.limit,
                })
              : inspector === "inspectTurnState"
                ? await gad.inspectTurnState({
                    trajectoryId: logIdForChannel(channelId),
                    branchId: input.branchId,
                    limit: input.limit,
                  })
                : await gad.inspectPublicationIntegrity(input);
          return {
            receipt: receipt("follow-up"),
            kind,
            inspector,
            counters: Object.entries(observation.summary).map(
              ([name, count]) => ({ name, count }),
            ),
          };
        },
      },
      gadConversation: {
        async read(id: string): Promise<ChannelTail> {
          claim(id, view === "recap");
          if (branchId !== undefined) {
            return {
              receipt: receipt("tail"),
              channelId,
              status: "branch-not-supported",
              range: { fromSeq: 0, toSeq: 0, envelopes: 0 },
              standing: "empty",
              latest: null,
            };
          }
          const tail = await gad.inspectChannelEnvelopes({
            channelId,
            window: { kind: "tail" },
            limit: 40,
          });
          const summary = summarizeChannel([tail]);
          return {
            receipt: receipt("tail"),
            channelId,
            status: "observed",
            range: summary.range,
            standing: summary.standing,
            latest:
              summary.latest === undefined
                ? null
                : {
                    seq: summary.latest,
                    speaker: summary.latestSpeaker ?? "unknown",
                    text: summary.latestText ?? "",
                  },
          };
        },
      },
    },
  };
}
