/**
 * Fork-lineage view types shared by the headless `ForkLineageStore` and the
 * chat UIs (fork switcher, lineage tree, inline fork rows, subagent review).
 */

import type { ChatMessage } from "../../derived-types.js";
import type { PresentableActor } from "../../chat-presentation/actor.js";

export type ForkActor = PresentableActor;

/** Client-side mirror of the channel DO's `getProvenance()` result. */
export type ChannelProvenance =
  | { kind: "root" }
  | {
      kind: "fork";
      forkedFrom: string;
      parentContextId: string;
      forkPointId: number;
      rootChannelId: string;
    }
  | {
      kind: "task";
      parentChannelId: string;
      parentContextId: string;
      runId: string;
    };

/** A fork surfaced in the switcher / tree (a child of the current channel or a
 *  sibling read from the parent's `forks` projection). */
export interface ForkEntry {
  forkId: string;
  channelId: string;
  contextId: string;
  label: string;
  reason: string;
  /** Who forked, as recorded; present with `ForkUiState.presentActor`. */
  actor: ForkActor;
  forkPointId: number;
  createdAtSeq: number;
  /** Latest durable head reported by this fork. */
  headSeq: number;
  /** Channel on whose log rename/archive facts for this entry live. */
  parentChannelId: string;
  archived: boolean;
  /** Live "has unread since our cursor" badge, reconciled on open. */
  unread?: boolean;
}

/** One node of the lazily-walked lineage tree ("Show tree" overlay). */
export interface ForkTreeNode {
  channelId: string;
  contextId?: string;
  label: string;
  provenanceKind: "root" | "fork" | "task";
  children: ForkTreeNode[];
  isCurrent: boolean;
  headSeq?: number;
  unread?: boolean;
}

/** Host-supplied navigation and persistence handlers. */
export interface ForkNavHandlers {
  /** In-place switch: rebind the surface's channel + context and reconnect. */
  switchTo: (channelId: string, contextId: string) => void | Promise<void>;
  /** Side-by-side: open the fork in a NEW chat surface. */
  openInNewPanel: (channelId: string, contextId: string) => void | Promise<void>;
  /** Host-persisted lineage read cursors. */
  readForkCursors?: () => Record<string, number>;
  /** Persist one monotone lineage read cursor. */
  markForkRead?: (channelId: string, headSeq: number) => void | Promise<void>;
  /** A fork the local user did not initiate just landed. The host owns focus
   * policy and notification presentation. */
  onExternalFork?: (fork: {
    forkedChannelId: string;
    forkedContextId: string;
    actorName: string;
    forkPointId: number;
  }) => void | Promise<void>;
}

/** Fork lineage state + actions read by every lineage surface. */
export interface ForkUiState {
  provenance?: ChannelProvenance;
  currentLabel: string;
  /** Direct-child forks of the current channel. */
  children: ForkEntry[];
  /** Sibling forks (the parent's other children). */
  siblings: ForkEntry[];
  /** Parent channel breadcrumb, when this channel is itself a fork or task. */
  parent?: { channelId: string; contextId?: string };
  /** True while a fork op is mid-flight (disables the affordances). */
  forking: boolean;
  /** Last actionable lineage/fork failure; never dropped to console only. */
  error?: string;
  /** The live lineage stream stopped; `actions.retryLiveUpdates()` resumes it
   *  (the client's reconnect event also resumes it automatically). */
  liveUpdatesInterrupted?: boolean;
  /** The label every surface shows for a fork's actor: "You" for the local
   *  person, otherwise the actor's display name or role. */
  presentActor: (actor: ForkActor) => string;
  /** Reconcile siblings + badges from durable heads (call on switcher/tree open). */
  refresh: () => void;
  /** Walk provenance up + forks down into the full lineage tree (lazy). */
  loadTree: () => Promise<ForkTreeNode[]>;
  actions: {
    /** Fork after a message (inclusive), no seed. */
    forkFromMessage: (msg: ChatMessage) => Promise<void>;
    /** Fork before a message seeding an edited turn (replaces it). */
    editAndForkMessage: (msg: ChatMessage, newText: string) => Promise<void>;
    /** Channel-level fork at the current head, no seed. */
    newFork: () => Promise<void>;
    renameFork: (entry: ForkEntry, label: string) => Promise<void>;
    archiveFork: (entry: ForkEntry) => Promise<void>;
    clearError: () => void;
    reportError: (summary: string, error: unknown) => void;
    /** Resubscribe the live lineage stream after it stopped. */
    retryLiveUpdates?: () => void;
  } & ForkNavHandlers;
}
