/**
 * DeferredAgentMachine — the first-agent flow, framework-free.
 *
 * On a brand-new chat the host may activate an uncommitted provisional agent
 * for the inline config while the user types. The first send (or an injected
 * retained opening request) parks the message in a client-side queue and ARMS
 * a claim; the spawn driver issues `onAddAgent` with that exact config, and
 * when the claimed agent joins the roster the queue is flushed LIVE (per item)
 * — so the first message lands as a normal turn to a present agent rather than
 * backlog replay.
 *
 * The whole flow is scoped to OUR spawn (`armed`), so reconnection /
 * rehydration windows (pending agents we did NOT spawn) keep their normal
 * send-immediately path. Hosts without `onAddAgent` can still release a
 * retained opening request once their externally managed agent joins; they do
 * not create an agent here.
 *
 * Driving it:
 *   - `setHostInputs(patch)` merges input fields (every own key of the patch
 *     overwrites, including an explicit `undefined`); it does not run anything.
 *   - `reconcile()` runs the pipeline below to a fixed point and publishes one
 *     snapshot. Call it after changing inputs.
 *   - Actions (`send`, `setDraft`, `setAgentId`, `cancelQueued`, `startQueued`,
 *     `retryLaunch`, `retryDelivery`) and async completions reconcile
 *     themselves.
 *
 * Reconcile pipeline (each step is a former effect of `useDeferredAgent`, in
 * its original order; the pass repeats until no step changes state):
 *    1. latchEverHadAgent           — an agent was ever present (hides setup)
 *    2. syncExplicitModelChoice     — selection-required is a sticky boundary
 *    3. pickInitialAgentType        — first gallery entry once it loads
 *    4. seedDraftDefaults           — late defaults fill an untouched draft
 *    5. detectLaunchFailure         — a worker error event fails our launch
 *    6. prepareProvisionalAgent     — host lease follows the current intent
 *    7. armAfterModelDiscovery      — a send held by discovery arms on ready
 *    8. driveSpawn                  — issue onAddAgent exactly once
 *    9. abandonUnissuedSpawn        — everything cancelled before issue → disarm
 *   10. resetAfterJoin              — our spawn is done once an agent is present
 *   11. flushQueueOnJoin            — publish the queue live, per item
 *   12. retireResolvedOpeningRequest — the channel resolved it elsewhere
 *   13. enqueueOpeningRequest       — a retained opening joins the same queue
 */

import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { isAgentParticipantType, type AttachmentInput } from "@workspace/pubsub";
import { isModelAgentLaunchable } from "@workspace/model-catalog/catalog";
import type { AgentSubscriptionConfig } from "../../agent-subscription-config.js";
import type { AvailableAgent } from "../../types.js";
import { RetainCount, StateCell, errorMessage, shallowEqual, type ReadableStore } from "../store.js";
import { draftForAgent, draftToConfig, type AgentConfigDraft } from "./agent-config-draft.js";
import type {
  DeferredAgentInputs,
  DeferredAgentSnapshot,
  DeferredAgentState,
  DeferredSendOptions,
  PendingDelivery,
} from "./types.js";

/** A reconcile that keeps changing state is a logic defect, not slow work. */
const MAX_RECONCILE_PASSES = 32;
const OPENING_REQUEST_ID = "conversation-opening";

/** Build the spawn config from a draft, dropping the handle: the first-agent
 *  setup never exposes a handle field, so a draft handle is only a seeded
 *  default and must not leak onto the spawned agent — the host derives a valid
 *  handle for the resolved agent type. */
export function spawnConfigFromDraft(draft: AgentConfigDraft): AgentSubscriptionConfig {
  const config = draftToConfig(draft);
  delete (config as Record<string, unknown>)["handle"];
  return config;
}

interface Derived {
  agentPresent: boolean;
  canDefer: boolean;
  canSpawn: boolean;
  preflight: "checking" | "ready" | "selection-required";
  modelSelectionRequired: boolean;
  modelDiscoveryPending: boolean;
  setupActive: boolean;
  launching: boolean;
  active: boolean;
  deliveryError: string | undefined;
}

export class DeferredAgentMachine implements ReadableStore<DeferredAgentSnapshot> {
  readonly #cell = new StateCell<DeferredAgentSnapshot>({ deferredAgent: undefined });
  readonly #retain: RetainCount;
  readonly #lifetime = new AbortController();
  #inputs: DeferredAgentInputs;

  // --- Flow state -----------------------------------------------------------
  #queued: PendingDelivery[] = [];
  #agentId: string | undefined;
  #draft: AgentConfigDraft = { model: "" };
  /** Committed to spawning OUR first agent. */
  #armed = false;
  #launchFailed = false;
  #failedDelivery: { id: string; message: string } | undefined;
  /** First-run model setup is an explicit-choice boundary: provider setup may
   *  make the model usable, but must not dismiss setup before the user starts. */
  #explicitModelChoiceActive: boolean;
  /** The batch currently being published, and the item inside it. */
  #flushing: { itemId?: string } | null = null;
  #draftTouched = false;
  #modelTouched = false;
  #agentTypeTouched = false;
  /** Type + config captured when the spawn was armed; retries reuse it. */
  #spawnIntent: { agentId: string | undefined; config: AgentSubscriptionConfig } | null = null;
  #issued = false;
  #spawnInFlight = false;
  #everHadAgent = false;
  #openingRequestEnqueued = false;
  #waitingForModelDiscovery = false;
  #preparedFingerprint = "none";
  #seedDeps: readonly unknown[] | null = null;

  // --- Reconcile bookkeeping --------------------------------------------------
  #reconciling = false;
  #reconcileAgain = false;

  constructor(inputs: DeferredAgentInputs) {
    this.#inputs = { ...inputs };
    this.#explicitModelChoiceActive = inputs.firstAgentModelPreflight === "selection-required";
    this.#retain = new RetainCount({ start: () => undefined, dispose: () => this.#dispose() });
  }

  readonly getSnapshot = (): DeferredAgentSnapshot => this.#cell.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.#cell.subscribe(listener);

  /** Hold the machine; the last release retires a prepared provisional lease. */
  retain(): () => void {
    return this.#retain.retain();
  }

  /** Dispose now: stop owned async work and retire a prepared provisional lease. */
  dispose(): void {
    this.#retain.disposeNow();
  }

  /**
   * Merge input fields. Every own key overwrites, including `undefined`. An
   * array input whose elements are unchanged keeps its previous identity, so a
   * host that rebuilds an equal list on every render (`agents ?? []`) is not a
   * change — the snapshot it feeds must not churn back into the host.
   */
  setHostInputs(patch: Partial<DeferredAgentInputs>): void {
    const next = { ...this.#inputs };
    for (const key of Object.keys(patch) as Array<keyof DeferredAgentInputs>) {
      const previous = (next as Record<string, unknown>)[key];
      const value = patch[key];
      (next as Record<string, unknown>)[key] =
        Array.isArray(previous) && Array.isArray(value) && shallowEqual(previous, value)
          ? previous
          : value;
    }
    this.#inputs = next;
  }

  /** Run the pipeline to a fixed point and publish one snapshot. */
  reconcile(): void {
    if (this.#lifetime.signal.aborted) return;
    if (this.#reconciling) {
      this.#reconcileAgain = true;
      return;
    }
    this.#reconciling = true;
    try {
      this.#cell.transaction(() => {
        let passes = 0;
        do {
          this.#reconcileAgain = false;
          if (this.#runSteps()) this.#reconcileAgain = true;
          passes += 1;
          if (passes >= MAX_RECONCILE_PASSES && this.#reconcileAgain) {
            console.error("[DeferredAgentMachine] reconcile did not converge");
            break;
          }
        } while (this.#reconcileAgain);
        this.#publish();
      });
    } finally {
      this.#reconciling = false;
    }
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  /** The composer send: deferred while the first agent is coming. */
  readonly send = async (
    attachments?: AttachmentInput[],
    options?: DeferredSendOptions
  ): Promise<void> => {
    const inputs = this.#inputs;
    const derived = this.#derive();
    // Agent present and no flush in progress → straight to the normal send.
    // (During an in-flight flush even live sends queue, so a fresh message
    // can't leapfrog still-queued first messages.)
    if (derived.agentPresent && this.#queued.length === 0 && !this.#flushing) {
      return inputs.coreSendMessage(attachments, options);
    }
    // No agent and not our deferred flow → the normal send still goes out.
    if (!derived.agentPresent && !derived.active && this.#queued.length === 0) {
      return inputs.coreSendMessage(attachments, options);
    }
    const text = inputs.input.trim();
    const hasAttachments = !!attachments?.length;
    if (!text && !hasAttachments) return;
    const deliveryId = crypto.randomUUID();
    this.#queued = [
      ...this.#queued,
      {
        kind: "message",
        id: deliveryId,
        idempotencyKey: deliveryId,
        text,
        ...(hasAttachments ? { attachments } : {}),
        ...(options?.mentions && options.mentions.length > 0 ? { mentions: options.mentions } : {}),
        ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      },
    ];
    inputs.clearComposer();
    // Commit to spawning our first agent, snapshotting its type + config now.
    // An in-flight-flush enqueue needs no new agent.
    if (
      derived.canDefer &&
      inputs.firstAgentPending &&
      !derived.agentPresent &&
      !this.#armed &&
      derived.preflight === "ready"
    ) {
      this.#spawnIntent = {
        agentId: this.#agentTypeTouched ? this.#agentId : undefined,
        config: spawnConfigFromDraft(this.#draft),
      };
      this.#armed = true;
    } else if (
      derived.canDefer &&
      inputs.firstAgentPending &&
      !derived.agentPresent &&
      derived.preflight === "checking"
    ) {
      this.#waitingForModelDiscovery = true;
    }
    this.reconcile();
  };

  readonly setDraft = (next: AgentConfigDraft): void => {
    this.#draftTouched = true;
    if (next.model !== this.#draft.model) this.#modelTouched = true;
    this.#draft = next;
    this.reconcile();
  };

  readonly setAgentId = (id: string | undefined): void => {
    const inputs = this.#inputs;
    this.#agentTypeTouched = true;
    this.#agentId = id;
    const seeded = this.#seed(inputs.availableAgents.find((agent) => agent.id === id));
    // Switching type reseeds behavior defaults but keeps a model the user chose.
    this.#draft = { ...seeded, model: this.#modelTouched ? this.#draft.model : seeded.model };
    this.reconcile();
  };

  readonly cancelQueued = (id: string): void => {
    // Publication has begun; removal can no longer promise an unsent message.
    if (this.#flushing?.itemId === id) return;
    if (this.#queued.find((item) => item.id === id)?.kind === "opening-request") {
      const signal = this.#lifetime.signal;
      void this.#inputs.resolveOpeningRequest("cancel").then(
        () => {
          if (signal.aborted) return;
          this.#queued = this.#queued.filter((item) => item.id !== id);
          this.reconcile();
        },
        (error: unknown) => {
          if (signal.aborted) return;
          this.#failedDelivery = { id, message: errorMessage(error) };
          this.reconcile();
        }
      );
      return;
    }
    this.#queued = this.#queued.filter((item) => item.id !== id);
    this.reconcile();
  };

  readonly startQueued = (): void => {
    const derived = this.#derive();
    if (derived.agentPresent || this.#armed || this.#queued.length === 0 || !this.#draft.model)
      return;
    const selectedModel = this.#inputs.modelCatalog?.models.find(
      (model) => model.ref === this.#draft.model
    );
    if (!isModelAgentLaunchable(selectedModel)) return;
    this.#spawnIntent = {
      agentId: this.#agentTypeTouched ? this.#agentId : undefined,
      config: spawnConfigFromDraft(this.#draft),
    };
    this.#explicitModelChoiceActive = false;
    this.#armed = true;
    this.reconcile();
  };

  readonly retryLaunch = (): void => {
    this.#issued = false;
    this.#launchFailed = false; // re-arms the spawn driver
    this.reconcile();
  };

  readonly retryDelivery = (): void => {
    this.#failedDelivery = undefined;
    this.reconcile();
  };

  // ===========================================================================
  // Pipeline
  // ===========================================================================

  #derive(): Derived {
    const inputs = this.#inputs;
    const agentPresent = Object.values(inputs.participants).some((participant) =>
      isAgentParticipantType(participant.metadata.type)
    );
    const preflight = inputs.firstAgentModelPreflight ?? "ready";
    const canDefer = !!inputs.onAddAgent;
    const canSpawn = canDefer && inputs.availableAgents.length > 0;
    const agentComing = inputs.pendingAgents.size > 0 || this.#armed;
    const modelSelectionRequired =
      preflight === "selection-required" || this.#explicitModelChoiceActive;
    const everHadAgent = this.#everHadAgent || agentPresent;
    // Channel creation owns first-agent readiness. Authored history and setup
    // coexist; an unresolved opening request waits for explicit model selection
    // when required, otherwise it launches the configured first agent.
    const setupActive =
      !agentPresent &&
      !agentComing &&
      canDefer &&
      (!inputs.openingRequest || modelSelectionRequired) &&
      inputs.replaySettled &&
      inputs.firstAgentPending &&
      !everHadAgent;
    const launching = !agentPresent && this.#armed;
    const failed = this.#failedDelivery;
    return {
      agentPresent,
      canDefer,
      canSpawn,
      preflight,
      modelSelectionRequired,
      modelDiscoveryPending: preflight === "checking",
      setupActive,
      launching,
      active: setupActive || launching,
      deliveryError:
        failed && this.#queued.some((item) => item.id === failed.id)
          ? failed.message || "Delivery failed"
          : undefined,
    };
  }

  /** One pass over every step; true when any step changed state. */
  #runSteps(): boolean {
    let changed = false;
    changed = this.#latchEverHadAgent() || changed;
    changed = this.#syncExplicitModelChoice() || changed;
    changed = this.#pickInitialAgentType() || changed;
    changed = this.#seedDraftDefaults() || changed;
    changed = this.#detectLaunchFailure() || changed;
    this.#prepareProvisionalAgent();
    changed = this.#armAfterModelDiscovery() || changed;
    changed = this.#driveSpawn() || changed;
    changed = this.#abandonUnissuedSpawn() || changed;
    changed = this.#resetAfterJoin() || changed;
    changed = this.#flushQueueOnJoin() || changed;
    changed = this.#retireResolvedOpeningRequest() || changed;
    changed = this.#enqueueOpeningRequest() || changed;
    return changed;
  }

  /** 1. A routine departure from an established chat never re-shows setup. */
  #latchEverHadAgent(): boolean {
    if (this.#everHadAgent || !this.#derive().agentPresent) return false;
    this.#everHadAgent = true;
    return true;
  }

  /** 2. */
  #syncExplicitModelChoice(): boolean {
    const { agentPresent, preflight } = this.#derive();
    const next =
      agentPresent || this.#armed
        ? false
        : preflight === "selection-required"
          ? true
          : this.#explicitModelChoiceActive;
    if (next === this.#explicitModelChoiceActive) return false;
    this.#explicitModelChoiceActive = next;
    return true;
  }

  /** 3. */
  #pickInitialAgentType(): boolean {
    const agents = this.#inputs.availableAgents;
    if (this.#agentId !== undefined || agents.length === 0) return false;
    this.#agentId = agents[0]?.id;
    return this.#agentId !== undefined;
  }

  /**
   * 4. Keep inherited defaults synchronized as gallery/settings arrive in
   * either order. User edits stay authoritative; when only another field was
   * touched, a late effective model may still fill the model. Runs when its
   * inputs change (like the effect it replaces); a structurally equal seed
   * keeps the existing draft object.
   */
  #seedDraftDefaults(): boolean {
    const inputs = this.#inputs;
    const deps = [
      this.#agentId,
      inputs.availableAgents,
      inputs.modelCatalog,
      inputs.defaultModelRef,
      inputs.defaultAgentConfig,
    ];
    const previous = this.#seedDeps;
    if (previous && deps.every((value, index) => Object.is(value, previous[index]))) return false;
    this.#seedDeps = deps;
    if (inputs.availableAgents.length === 0 && !inputs.modelCatalog && !inputs.defaultAgentConfig)
      return false;
    const agent =
      inputs.availableAgents.find((candidate) => candidate.id === this.#agentId) ??
      inputs.availableAgents[0];
    const seeded = this.#seed(agent);
    if (!seeded.model && !seeded.handle) return false;
    const current = this.#draft;
    let next = current;
    if (!this.#draftTouched) next = seeded;
    else if (!this.#modelTouched && seeded.model && current.model !== seeded.model)
      next = { ...current, model: seeded.model };
    if (next === current || canonicalJson(next) === canonicalJson(current)) return false;
    this.#draft = next;
    return true;
  }

  /**
   * 5. A host can acknowledge the spawn RPC before the worker reports a
   * build/start error. That lifecycle event, or the RPC's rejection,
   * establishes failure; a slow launch keeps its ownership and queued input.
   */
  #detectLaunchFailure(): boolean {
    if (!this.#armed || this.#launchFailed || this.#derive().agentPresent) return false;
    const failed = Array.from(this.#inputs.pendingAgents.values()).some(
      (agent) => agent.status === "error"
    );
    if (!failed) return false;
    this.#launchFailed = true;
    return true;
  }

  /**
   * 6. Optimistically activate the current first-agent intent while the user
   * composes. The host owns the provisional lease (not subscribed/persisted
   * yet). Draft changes update this one intent; an unusable/absent intent
   * retires it. Deduplicated by intent fingerprint.
   */
  #prepareProvisionalAgent(): void {
    const inputs = this.#inputs;
    const onPrepareAgent = inputs.onPrepareAgent;
    if (!onPrepareAgent) return;
    const { agentPresent, preflight } = this.#derive();
    const selectedAgent =
      inputs.availableAgents.find((agent) => agent.id === this.#agentId) ??
      inputs.availableAgents[0];
    const latestDraft = this.#draftTouched ? this.#draft : this.#seed(selectedAgent);
    const selectedModel = inputs.modelCatalog?.models.find((model) => model.ref === latestDraft.model);
    const modelChoiceAllowsPrewarm =
      preflight === "ready" || (preflight === "selection-required" && this.#modelTouched);
    const shouldPrepare =
      !agentPresent &&
      inputs.pendingAgents.size === 0 &&
      inputs.replaySettled &&
      inputs.firstAgentPending &&
      !this.#everHadAgent &&
      inputs.availableAgents.length > 0 &&
      modelChoiceAllowsPrewarm &&
      isModelAgentLaunchable(selectedModel);
    const explicitAgentId = this.#agentTypeTouched ? this.#agentId : undefined;
    const config = shouldPrepare ? spawnConfigFromDraft(latestDraft) : null;
    const fingerprint = config
      ? canonicalJson({ channelName: inputs.channelName, agentId: explicitAgentId, config })
      : "none";
    if (this.#preparedFingerprint === fingerprint) return;
    this.#preparedFingerprint = fingerprint;
    void onPrepareAgent(explicitAgentId, config).catch((error: unknown) => {
      console.warn("[DeferredAgentMachine] Failed to prepare provisional agent:", error);
    });
  }

  /**
   * 7. A first message may arrive while model settings are still loading. Arm
   * only messages held by that discovery wait; a later `selection-required` →
   * `ready` transition must not silently cross the explicit-choice boundary.
   */
  #armAfterModelDiscovery(): boolean {
    if (this.#derive().preflight !== "ready" || !this.#waitingForModelDiscovery) return false;
    this.#waitingForModelDiscovery = false;
    if (!this.#derive().agentPresent && !this.#armed && this.#queued.length > 0)
      this.#armed = true;
    return true;
  }

  /**
   * 8. Issue onAddAgent exactly once, as soon as we're armed AND able to
   * spawn. Re-fires when spawning becomes possible (gallery loaded late) or a
   * failed launch is retried.
   */
  #driveSpawn(): boolean {
    const inputs = this.#inputs;
    const { agentPresent, canSpawn } = this.#derive();
    if (agentPresent || this.#launchFailed) return false;
    if (!this.#armed || this.#issued || this.#spawnInFlight) return false;
    if (this.#queued.length === 0) return false; // nothing to deliver → don't spawn
    if (inputs.pendingAgents.size > 0) return false; // an agent we didn't arm is coming
    const onAddAgent = inputs.onAddAgent;
    if (!canSpawn || !onAddAgent) return false;
    this.#issued = true;
    this.#spawnInFlight = true;
    // Injected opening requests never passed through `send`, so they have no
    // captured intent yet: resolve the untouched draft from the latest inputs,
    // then snapshot it so a retry issues exactly the same launch. A null id
    // lets the host resolve its default (honoring a pinned agent source).
    const selectedAgent =
      inputs.availableAgents.find((agent) => agent.id === this.#agentId) ??
      inputs.availableAgents[0];
    const launchDraft = this.#draftTouched ? this.#draft : this.#seed(selectedAgent);
    const intent = this.#spawnIntent ?? {
      agentId: this.#agentTypeTouched ? this.#agentId : undefined,
      config: spawnConfigFromDraft(launchDraft),
    };
    this.#spawnIntent = intent;
    const signal = this.#lifetime.signal;
    void Promise.resolve()
      .then(() => onAddAgent(intent.agentId, intent.config))
      .then(
        () => {
          this.#spawnInFlight = false;
          if (!signal.aborted) this.reconcile();
        },
        (error: unknown) => {
          console.warn("[DeferredAgentMachine] Failed to launch agent:", error);
          this.#spawnInFlight = false;
          if (signal.aborted) return;
          this.#issued = false;
          this.#launchFailed = true;
          this.reconcile();
        }
      );
    return true;
  }

  /** 9. The user cancelled every held message before the agent was issued. */
  #abandonUnissuedSpawn(): boolean {
    if (!this.#armed || this.#issued || this.#spawnInFlight || this.#derive().agentPresent)
      return false;
    if (this.#queued.length > 0) return false;
    this.#spawnIntent = null;
    this.#armed = false;
    return true;
  }

  /** 10. Once an agent is present our spawn is done; reset so a later
   *  legitimate re-defer isn't blocked by stale flags. */
  #resetAfterJoin(): boolean {
    if (!this.#derive().agentPresent) return false;
    this.#issued = false;
    this.#spawnInFlight = false;
    this.#spawnIntent = null;
    const changed = this.#armed || this.#launchFailed;
    this.#armed = false;
    this.#launchFailed = false;
    return changed;
  }

  /**
   * 11. Flush the queue LIVE the moment an agent joins — per item, so a
   * delivered message leaves the queue immediately and a partial failure
   * neither strands delivered items nor re-sends them. A failure stays
   * visible until the user explicitly retries (or removes that item).
   */
  #flushQueueOnJoin(): boolean {
    const { agentPresent, deliveryError } = this.#derive();
    if (!agentPresent || this.#queued.length === 0 || this.#flushing || deliveryError) return false;
    const flushing: { itemId?: string } = {};
    this.#flushing = flushing;
    const batch = [...this.#queued];
    const { publishText, maybeSetDefaultTitle, resolveOpeningRequest } = this.#inputs;
    const signal = this.#lifetime.signal;
    void (async () => {
      let deliveryId: string | undefined;
      try {
        let titled = false;
        for (const item of batch) {
          if (signal.aborted) return;
          // The user may remove later items while an earlier one flushes:
          // cancel still means "do not send" until that item's delivery begins.
          if (!this.#queued.some((queued) => queued.id === item.id)) continue;
          deliveryId = item.id;
          flushing.itemId = item.id;
          this.reconcile();
          if (item.kind === "opening-request") await resolveOpeningRequest("deliver");
          else
            await publishText(item.text, {
              attachments: item.attachments,
              mentions: item.mentions,
              replyTo: item.replyTo,
              metadata: item.metadata,
              tier: item.tier,
              idempotencyKey: item.idempotencyKey,
            });
          if (signal.aborted) return;
          // Title from the first delivered queued message (brand-new chat).
          if (!titled && item.text) {
            maybeSetDefaultTitle(item.text);
            titled = true;
          }
          this.#queued = this.#queued.filter((queued) => queued.id !== item.id);
          this.reconcile();
        }
      } catch (error) {
        if (deliveryId && !signal.aborted)
          this.#failedDelivery = { id: deliveryId, message: errorMessage(error) };
      } finally {
        if (this.#flushing === flushing) this.#flushing = null;
        // Completion of the owned batch makes later input eligible; this also
        // covers a failure whose queue entry was removed in flight.
        if (!signal.aborted) this.reconcile();
      }
    })();
    return true;
  }

  /** 12. The channel owns the opening request; its terminal projection
   *  retires the local entry even if another client resolved it. */
  #retireResolvedOpeningRequest(): boolean {
    const inputs = this.#inputs;
    if (!inputs.replaySettled || inputs.openingRequest) return false;
    this.#openingRequestEnqueued = false;
    if (!this.#queued.some((item) => item.kind === "opening-request")) return false;
    this.#queued = this.#queued.filter((item) => item.kind !== "opening-request");
    return true;
  }

  /** 13. Every host uses the same pending-delivery queue; agent creation is
   *  optional — an externally managed agent's join drains it too. */
  #enqueueOpeningRequest(): boolean {
    const inputs = this.#inputs;
    if (!inputs.replaySettled || !inputs.openingRequest || this.#openingRequestEnqueued)
      return false;
    this.#openingRequestEnqueued = true;
    this.#queued = [
      ...this.#queued,
      {
        kind: "opening-request",
        id: OPENING_REQUEST_ID,
        text: inputs.openingRequest,
        tier: "secondary",
      },
    ];
    const { canDefer, preflight } = this.#derive();
    if (canDefer && inputs.firstAgentPending && preflight === "ready") this.#armed = true;
    else if (canDefer && inputs.firstAgentPending && preflight === "checking")
      this.#waitingForModelDiscovery = true;
    return true;
  }

  // ===========================================================================

  #seed(agent: AvailableAgent | undefined): AgentConfigDraft {
    const inputs = this.#inputs;
    return draftForAgent(agent, {
      modelCatalog: inputs.modelCatalog,
      defaultModelRef: inputs.defaultModelRef,
      defaultAgentConfig: inputs.defaultAgentConfig,
      showReactiveness: false,
    });
  }

  #publish(): void {
    const derived = this.#derive();
    if (!derived.active && this.#queued.length === 0) {
      this.#cell.update({ deferredAgent: undefined });
      return;
    }
    const next: DeferredAgentState = {
      active: derived.active,
      setupActive: derived.setupActive,
      launching: derived.launching,
      launchFailed: this.#launchFailed,
      deliveryError: derived.deliveryError,
      deliveringId: this.#flushing?.itemId,
      retryDelivery: this.retryDelivery,
      modelSelectionRequired: derived.modelSelectionRequired,
      modelDiscoveryPending: derived.modelDiscoveryPending,
      startQueued: this.startQueued,
      retryLaunch: this.retryLaunch,
      draft: this.#draft,
      setDraft: this.setDraft,
      agentId: this.#agentId,
      setAgentId: this.setAgentId,
      availableAgents: this.#inputs.availableAgents,
      queued: this.#queued,
      cancelQueued: this.cancelQueued,
    };
    const previous = this.#cell.getSnapshot().deferredAgent;
    if (previous && sameState(previous, next)) return;
    this.#cell.update({ deferredAgent: next });
  }

  #dispose(): void {
    this.#lifetime.abort(new Error("Deferred agent flow disposed"));
    // If this chat surface disappears before claim, release the host lease.
    if (this.#preparedFingerprint === "none") return;
    this.#preparedFingerprint = "none";
    void this.#inputs.onPrepareAgent?.(undefined, null).catch((error: unknown) => {
      console.warn("[DeferredAgentMachine] Failed to retire provisional agent:", error);
    });
  }
}

function sameState(a: DeferredAgentState, b: DeferredAgentState): boolean {
  for (const key of Object.keys(b) as Array<keyof DeferredAgentState>) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
}
