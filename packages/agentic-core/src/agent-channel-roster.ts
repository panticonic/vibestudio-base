import type { ParticipantRef } from '@workspace/agentic-protocol';

/** Product addressing and method offers; this contains no execution state. */
export interface RosterEntry {
  participantId: string;
  ref: ParticipantRef;
  handle?: string;
  type?: string;
  methods: {name: string; description?: string; parameters?: unknown}[];
}
