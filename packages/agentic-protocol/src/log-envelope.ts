import { z } from "zod";
import type { EnvelopeId } from "./ids.js";
import type {
  ActorRef,
  EventCausality,
  ParticipantRef,
  ParticipantSelector,
} from "./events.js";
import {
  actorRefSchema,
  causalitySchema,
  participantRefSchema,
  participantSelectorSchema,
  eventKindSchemas,
} from "./schemas.js";

export type LogKind = "trajectory" | "channel" | "vcs" | "builds" | "generic";

/** Causality keys for unified log events. Extends trajectory causality with
 *  cross-log publication provenance. */
export interface LogEventCausality extends EventCausality {
  originLogId?: string;
  originHead?: string;
  originEnvelopeId?: string;
  turnId?: string; // turnId folds into causality in the unified shape
}

export interface LogEnvelope<Payload = unknown> {
  logId: string;
  head: string;
  seq: number; // starts at 1 for new logs; child fork appends start at forkSeq + 1
  envelopeId: EnvelopeId;
  actor: ActorRef;
  to?: ParticipantRef[] | ParticipantSelector;
  payloadKind: string; // Agentic EventKind or a channel/VCS/build-specific kind.
  payload: Payload;
  annotations?: Record<string, unknown>; // policy-fold annotations (agentHops...), channel metadata/attachments
  causality?: LogEventCausality;
  appendedAt: string; // ISO timestamp
}

/** Agentic events have the same canonical representation in every log. */
export function isAgenticLogEventKind(kind: string): boolean {
  return Object.hasOwn(eventKindSchemas, kind);
}

/** The channel wire event is a view of one canonical log envelope. */
export function agenticEventFromLogEnvelope(
  envelope: LogEnvelope,
): Record<string, unknown> {
  const {
    originLogId: _originLogId,
    originHead: _originHead,
    originEnvelopeId: _originEnvelopeId,
    turnId,
    ...causality
  } = envelope.causality ?? {};
  return {
    kind: envelope.payloadKind,
    actor: envelope.actor,
    ...(turnId ? { turnId } : {}),
    ...(Object.keys(causality).length ? { causality } : {}),
    payload: envelope.payload,
    createdAt: envelope.appendedAt,
  };
}

/** Structural input for the canonical content of an event: accepts both full
 *  LogEnvelopes and the pre-append event shape. */
export interface LogEnvelopeSemanticInput {
  envelopeId: string;
  actor: unknown;
  to?: unknown;
  payloadKind: string;
  payload: unknown;
  annotations?: Record<string, unknown>;
  causality?: unknown;
  appendedAt: string;
}

/** The canonical content of an event: everything except where it sits (logId, head, seq).
 *  Two events of one id are the same event when this is equal (an "exact" re-append). */
export function logEnvelopeSemantic(
  envelope: LogEnvelopeSemanticInput,
): Record<string, unknown> {
  return {
    envelopeId: envelope.envelopeId,
    actor: envelope.actor,
    ...(envelope.to !== undefined ? { to: envelope.to } : {}),
    payloadKind: envelope.payloadKind,
    payload: envelope.payload,
    ...(envelope.annotations !== undefined
      ? { annotations: envelope.annotations }
      : {}),
    ...(envelope.causality !== undefined
      ? { causality: envelope.causality }
      : {}),
    appendedAt: envelope.appendedAt,
  };
}

const logEventCausalitySchema = causalitySchema
  .extend({
    originLogId: z.string().optional(),
    originHead: z.string().optional(),
    originEnvelopeId: z.string().optional(),
    turnId: z.string().optional(),
  })
  .strict();

export const logEnvelopeSchema = z
  .object({
    logId: z.string().min(1),
    head: z.string().min(1),
    seq: z.number().int().nonnegative(),
    envelopeId: z.string().min(1),
    actor: actorRefSchema,
    to: z
      .union([z.array(participantRefSchema), participantSelectorSchema])
      .optional(),
    payloadKind: z.string().min(1),
    payload: z.unknown(),
    annotations: z.record(z.unknown()).optional(),
    causality: logEventCausalitySchema.optional(),
    appendedAt: z.string().datetime({ offset: true }),
  })
  .strict();
