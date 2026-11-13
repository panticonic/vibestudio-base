/**
 * Verified origin of a stored channel envelope (tendrils plan 4.6, contract
 * 5.6). The channel owner stamps it from host-verified caller facts only, never
 * from the publish payload, and carries it in the envelope's policy
 * annotations under `ENVELOPE_ORIGIN_ANNOTATION`.
 */
export type EnvelopeOriginSurface = "panel" | "shell" | "client" | "agent" | "website" | "host";

export interface EnvelopeOrigin {
  surface: EnvelopeOriginSurface;
  panelSource?: string;
  slotId?: string;
  deviceId?: string;
}

export const ENVELOPE_ORIGIN_ANNOTATION = "origin";

/** Ephemeral signal the agent vessel sends when its wake bound withholds observations. */
export const OBSERVATIONS_WITHHELD_SIGNAL = "agent.observations-withheld";
export interface ObservationsWithheldSignal {
  count: number;
  payloadKinds: string[];
}

const SURFACES: ReadonlySet<string> = new Set<EnvelopeOriginSurface>([
  "panel",
  "shell",
  "client",
  "agent",
  "website",
  "host",
]);

/** Read the channel-stamped origin from an event's annotations; malformed values read as absent. */
export function envelopeOrigin(event: {
  annotations?: Record<string, unknown>;
}): EnvelopeOrigin | null {
  const raw = event.annotations?.[ENVELOPE_ORIGIN_ANNOTATION];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const surface = record["surface"];
  if (typeof surface !== "string" || !SURFACES.has(surface)) return null;
  const origin: EnvelopeOrigin = { surface: surface as EnvelopeOriginSurface };
  for (const key of ["panelSource", "slotId", "deviceId"] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value) return null;
    origin[key] = value;
  }
  return origin;
}
