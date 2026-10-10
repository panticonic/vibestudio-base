import { brandId, type EnvelopeId } from "./ids.js";
import { canonicalJson } from "@vibestudio/content-addressing";
import { AGENTIC_EVENT_PAYLOAD_KIND } from "./constants.js";
import {
  isAgenticLogEventKind,
  type LogEventCausality,
} from "./log-envelope.js";
import type {
  ActorRef,
  AgenticEvent,
  ParticipantRef,
  ParticipantSelector,
} from "./events.js";
import {
  publicActorRef,
  publicParticipantMetadata,
  publicParticipantRef,
  sanitizeAgenticEventParticipantRefs,
} from "./participant-ref.js";
import { storedAgenticEventSchema } from "./schemas.js";
import { assertAgenticEventStoredValuesEncoded } from "./stored-values.js";

export function isAgenticLogKind(kind: string): boolean {
  return kind === "trajectory" || kind === "channel";
}

export interface LogAppendEventInput {
  envelopeId?: string | null;
  actor: ActorRef;
  to?: ParticipantRef[] | ParticipantSelector | null;
  payloadKind: string;
  payload: unknown;
  causality?: LogEventCausality | null;
  annotations?: Record<string, unknown> | null;
  appendedAt?: string | null;
  publish?: {
    channels: Array<{ channelId: string; audience?: unknown }>;
  } | null;
}

export interface PreparedLogEvent {
  envelopeId: EnvelopeId;
  /** Whether the caller supplied appendedAt (idempotent replays of implicit-
   *  timestamp appends compare against the stored timestamp instead). */
  appendedAtExplicit: boolean;
  actor: ActorRef;
  to?: ParticipantRef[] | ParticipantSelector;
  payloadKind: string;
  payload: unknown;
  annotations?: Record<string, unknown>;
  causality?: LogEventCausality;
  appendedAt: string;
  publish: Array<{ channelId: string; audience?: unknown }>;
}

function sanitizeRosterMethodSummaries(methods: unknown): unknown[] {
  const publicMethods = publicParticipantMetadata({ methods })?.methods;
  return publicMethods ?? [];
}

function sanitizeRosterSnapshotPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return payload;
  const record = payload as Record<string, unknown>;
  const details = record["details"];
  if (!details || typeof details !== "object" || Array.isArray(details))
    return payload;
  const detailsRecord = details as Record<string, unknown>;
  if (
    detailsRecord["kind"] !== "roster.snapshot" &&
    record["kind"] !== "roster.snapshot"
  ) {
    return payload;
  }
  const roster = detailsRecord["roster"];
  if (!roster || typeof roster !== "object" || Array.isArray(roster))
    return payload;
  const rosterRecord = roster as Record<string, unknown>;
  if (!Array.isArray(rosterRecord["participants"])) return payload;

  return {
    ...record,
    details: {
      ...detailsRecord,
      roster: {
        ...rosterRecord,
        participants: rosterRecord["participants"].map((participant) => {
          if (
            !participant ||
            typeof participant !== "object" ||
            Array.isArray(participant)
          ) {
            return participant;
          }
          const participantRecord = participant as Record<string, unknown>;
          const ref = participantRecord["ref"];
          return {
            ...participantRecord,
            ...(ref && typeof ref === "object" && !Array.isArray(ref)
              ? { ref: publicParticipantRef(ref as ParticipantRef) }
              : {}),
            methods: sanitizeRosterMethodSummaries(
              participantRecord["methods"],
            ),
          };
        }),
      },
    },
  };
}

function sanitizeAudience(
  audience: ParticipantRef[] | ParticipantSelector | null | undefined,
): ParticipantRef[] | ParticipantSelector | undefined {
  if (audience == null) return undefined;
  if (!Array.isArray(audience)) return audience;
  return audience.map((participant) => publicParticipantRef(participant));
}

function isAgenticEventPayload(payload: unknown): payload is AgenticEvent {
  return (
    !!payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>)["kind"] === "string" &&
    typeof (payload as Record<string, unknown>)["actor"] === "object" &&
    typeof (payload as Record<string, unknown>)["createdAt"] === "string"
  );
}

/** Strip cross-log/turn keys so the remaining causality matches the agentic
 *  trajectory causality shape. */
export function agenticLogCausality(
  causality: LogEventCausality | null | undefined,
): Record<string, unknown> | undefined {
  if (!causality) return undefined;
  const {
    originLogId: _originLogId,
    originHead: _originHead,
    originEnvelopeId: _originEnvelopeId,
    turnId: _turnId,
    ...rest
  } = causality as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** One semantic normalization for channel ownership and global observation.
 * Defaults are supplied by the owning operation; this function has no clock or ID side effects. */
export function prepareLogEvent(
  logKind: string,
  input: LogAppendEventInput,
  defaults: { envelopeId: string; appendedAt: string },
): PreparedLogEvent {
  if (!input.payloadKind)
    throw new Error("appendLogEvent requires payloadKind");
  const envelopeId = brandId<EnvelopeId>(
    input.envelopeId ?? defaults.envelopeId,
  );
  let appendedAtExplicit = input.appendedAt != null;
  let appendedAt = input.appendedAt ?? defaults.appendedAt;
  const actor = publicActorRef(input.actor) as ActorRef;
  const to = sanitizeAudience(input.to ?? undefined);
  let payload = input.payload;
  let causality = input.causality ?? undefined;
  let payloadKind = input.payloadKind;
  let annotations = input.annotations ?? undefined;
  if (
    annotations &&
    "metadata" in annotations &&
    annotations["metadata"] != null
  ) {
    annotations = {
      ...annotations,
      metadata: publicParticipantMetadata(
        annotations["metadata"] as Record<string, unknown>,
      ),
    };
  }

  const agenticKind =
    isAgenticLogKind(logKind) && isAgenticLogEventKind(input.payloadKind);
  if (agenticKind) {
    const causalityForEvent = agenticLogCausality(causality);
    const reconstructed = storedAgenticEventSchema.parse({
      kind: input.payloadKind,
      actor: input.actor,
      ...(causality?.turnId ? { turnId: causality.turnId } : {}),
      ...(causalityForEvent ? { causality: causalityForEvent } : {}),
      payload,
      createdAt: appendedAt,
    }) as AgenticEvent;
    const sanitized = sanitizeAgenticEventParticipantRefs(reconstructed);
    assertAgenticEventStoredValuesEncoded(sanitized);
    payload = sanitizeRosterSnapshotPayload(sanitized.payload);
  } else if (input.payloadKind === AGENTIC_EVENT_PAYLOAD_KIND) {
    if (!isAgenticEventPayload(payload)) {
      throw new Error("agentic channel payload must be a stored agentic event");
    }
    const parsed = storedAgenticEventSchema.parse(payload) as AgenticEvent;
    const sanitized = sanitizeAgenticEventParticipantRefs(parsed);
    assertAgenticEventStoredValuesEncoded(sanitized);
    // Channel transport carries an AgenticEvent; the journal stores its
    // semantic fields exactly like any other agentic log. There is no
    // second trajectory or separately acknowledged projection.
    payloadKind = sanitized.kind;
    payload = sanitizeRosterSnapshotPayload(sanitized.payload);
    const eventCausality = {
      ...sanitized.causality,
      ...(sanitized.turnId ? { turnId: sanitized.turnId } : {}),
    };
    for (const [key, value] of Object.entries(eventCausality)) {
      const presented = (causality as Record<string, unknown> | undefined)?.[
        key
      ];
      if (
        presented !== undefined &&
        canonicalJson(presented) !== canonicalJson(value)
      )
        throw new Error(
          `Channel event conflicts with envelope causality: ${key}`,
        );
    }
    causality = { ...causality, ...eventCausality };
    if (Object.keys(causality).length === 0) causality = undefined;
    appendedAt = sanitized.createdAt;
    appendedAtExplicit = true;
  }

  const publications = new Map<string, { channelId: string; audience?: unknown }>();
  for (const target of input.publish?.channels ?? []) {
    const audience = sanitizeAudience(target.audience as ParticipantRef[] | ParticipantSelector | null | undefined);
    const previous = publications.get(target.channelId);
    if (previous && canonicalJson(previous.audience ?? null) !== canonicalJson(audience ?? null))
      throw new Error("One publication destination cannot name different canonical audiences");
    if (!previous) publications.set(target.channelId, { channelId: target.channelId, ...(audience === undefined ? {} : { audience }) });
  }

  return {
    envelopeId,
    appendedAtExplicit,
    actor,
    ...(to !== undefined ? { to } : {}),
    payloadKind,
    payload,
    ...(annotations !== undefined ? { annotations } : {}),
    ...(causality !== undefined ? { causality } : {}),
    appendedAt,
    publish: [...publications.values()],
  };
}

export function prepareChannelLogEvent(
  input: LogAppendEventInput & { envelopeId: string; appendedAt: string },
): PreparedLogEvent {
  return prepareLogEvent("channel", input, input);
}
