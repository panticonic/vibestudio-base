// Lineage: fork lineage, observed child transcripts, transient channel signals.

export { ForkLineageStore } from "./fork-lineage-store.js";
export type {
  ForkLineageIdentity,
  ForkLineageInputs,
  ForkLineageRpc,
} from "./fork-lineage-store.js";
export type {
  ChannelProvenance,
  ForkEntry,
  ForkNavHandlers,
  ForkTreeNode,
  ForkUiState,
} from "./types.js";

export { ChildTranscriptStore } from "./child-transcript-store.js";
export type {
  ChildTranscriptConnection,
  ChildTranscriptSnapshot,
  ChildTranscriptTarget,
} from "./child-transcript-store.js";

export {
  ChannelSignalsStore,
  DEFAULT_MAX_SIGNALS,
  DEFAULT_SIGNAL_TTL_MS,
  normalizeSignalContent,
} from "./channel-signals-store.js";
export type { ChannelSignal, ChannelSignalsOptions } from "./channel-signals-store.js";
