import { gadWireMethods } from "@vibestudio/service-schemas/workspaceSource";
import type { RpcCaller } from "@vibestudio/rpc";
import { createGadServiceClient } from "@workspace/runtime/workerd-client";
import { MAX_CHANNEL_REPLAY_PAGE_LIMIT } from "@workspace/pubsub";
import type { LogEnvelope } from "@workspace/agentic-protocol";

/** Captured by the channel's canonical local append transaction. The observer
 * never reconstructs the event from a later publisher or its expired RPC scope. */
export interface ChannelObservationInput {
  kind: "append";
  sequence: number;
  envelopes: LogEnvelope[];
}
export interface ChannelObservationOutcome {
  observedSequence: number;
  envelopeId: string;
  hash: string;
}

/** The owner/host durable-work claim owns cancellation, settlement and joining.
 * This finite effect has no retry policy and never changes local membership. */
export async function observeChannelEvent(
  rpc: Pick<RpcCaller, "call">,
  channelId: string,
  input: ChannelObservationInput,
  signal?: AbortSignal,
): Promise<ChannelObservationOutcome> {
  signal?.throwIfAborted();
  const { envelopes, sequence } = input;
  if (!envelopes.length || envelopes.length > MAX_CHANNEL_REPLAY_PAGE_LIMIT)
    throw new Error("Channel observation requires a bounded locally committed prefix");
  for (const [index, envelope] of envelopes.entries()) {
    if (
      !Number.isSafeInteger(sequence) ||
      sequence <= 0 ||
      envelope.seq !== sequence + index ||
      (index > 0 && envelope.prevHash !== envelopes[index - 1]!.hash) ||
      envelope.logId !== channelId ||
      envelope.head !== "main" ||
      !envelope.envelopeId
    )
      throw new Error(
        "Channel observation requires an exact locally committed envelope",
      );
  }
  const result = await createGadServiceClient(rpc).callWithOptions(
    "appendLogEvent",
    gadWireMethods.appendLogEvent.args.parse([
      {
        logId: channelId,
        head: "main",
        logKind: "channel",
        idempotency: "exact",
        events: envelopes.map((envelope) => ({
            envelopeId: envelope.envelopeId,
            appendedAt: envelope.appendedAt,
            actor: envelope.actor,
            ...(envelope.to ? { to: envelope.to } : {}),
            payloadKind: envelope.payloadKind,
            payload: envelope.payload,
            ...(envelope.causality ? { causality: envelope.causality } : {}),
            ...(envelope.annotations
              ? { annotations: envelope.annotations }
              : {}),
          })),
      },
    ]),
    signal ? { signal } : {},
  );
  if (result.envelopes.length !== envelopes.length)
    throw new Error("Channel observation acknowledgement differs from its canonical local prefix");
  for (const [index, envelope] of envelopes.entries()) {
    const observed = result.envelopes[index];
    if (!observed || observed.envelopeId !== envelope.envelopeId ||
        observed.seq !== envelope.seq || observed.hash !== envelope.hash ||
        observed.prevHash !== envelope.prevHash)
      throw new Error("Channel observation acknowledgement differs from its canonical local envelope");
  }
  const observed = result.envelopes.at(-1)!;
  return {
    observedSequence: observed.seq,
    envelopeId: observed.envelopeId,
    hash: observed.hash,
  };
}
