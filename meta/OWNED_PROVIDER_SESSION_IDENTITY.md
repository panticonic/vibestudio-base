# Owned provider session identity

Inventory before edits, Base9fffccca (V25frozen, unchanged):

- NativeModelHelperTask/dispatchHelperTurn call Models.complete/Simple with
  protected capabilities but omit sessionId. Both ModelGatewayDO.runTurn and
  AgentVessel.completeNativeModel use this shared helper. Ordinary Pi generation
  and compaction use ensureProviderSessionId/ProviderDoc on their conversation.
- Pi Codex adapter openai-codex-responses.js177,195,750–765 caches a failed
  WebSocket negotiation only under options.sessionId; without one it attempts
  again for each helper request. This is a source-level explanation of repeated
  attempts, not attribution of all live403s or a measured latency reduction.
- ModelGatewayDO keeps one root conversation for its authenticated callers.
  Do not reuse that ProviderDoc identity for unrelated NL invocations. Core
  ModelTurnRequest.invocation_id is stable within one NL call; gatewayDriver
  also owns a per-eval-runtime turnPrefix. Carry their logical key in the typed
  gateway request; derive the actual opaque provider ID from authenticated
  gateway owner+caller and resolved model. Unidentified calls use unique turnId.
- Direct AgentVessel helpers already run in the channel's own Pi conversation;
  use that conversation's existing ProviderDoc UUID, including legacy migration.
  No new Pi conversation or persisted per-lambda document/cache is introduced.
- ModelGateway input schema is strict, client/worker/driver consume it. Explicit
  sessionId is metadata, never model context. Native helper target.options and
  actual completion options must carry the same owner identity; capabilities
  can also expose their existing provider identity; census tracks both forms.
  The deterministic protected provider now honors the canonical requested ID
  instead of replacing ordinary generation with raw conversation-number identity.
- NativeAgentOwner.ownedModelRequests owns every generation/helper connection.
  It currently joins each connection and Harness.close during normal retirement
  and failed-session closure. Track exact provider session IDs here, retain
  fallback state across one-shot helper task completion, then call Pi's canonical
  cleanupSessionResources(id) only AFTER joined Harness.close on both paths.
  A gateway owner can outlive an NL invocation; this bounded owner lifetime,
  rather than immediate per-call disposal, is the actual cleanup boundary.
- Opt out through canonical cacheRetention:none in gateway/helper options.
  Preserve credentials, native request admission/evidence, TLS/WS upgrade
  policy, transport fallback semantics, cancellation and protected capabilities.
- Concurrency inspection: gateway starts each caller+turn independently in a
  pending map (ModelGatewayDO242–272); protected request port starts each
  request; Pi scheduler handlers/joins run off its serialized commit line and
  model dispatch awaits only that invocation. No provider-global in-flight
  limiter found in these checked scopes. Credential refresh/model-catalog
  publication queues serialize refresh/storage, not whole inference turns.
  Actual simultaneous Luna requests remain unmeasured; provider/external quota
  concurrency and other uninspected backend internals remain unchecked.
- Engines: hosted Pi adapters consume sessionId; managed llama and wllama may
  consume canonical provider cache controls through their own adapters, no
  endpoint or sampling wire change. Python/SGLang don't execute Base's Pi
  helper/gateway; Core request already supplies invocation_id (contracts.ts4).
  No Core SDK/regeneration or engine inference is needed for this repair.

Independent lifetime limit: every distinct completed NL invocation keeps its
opaque ID in the gateway owner's census and Pi debug/fallback maps until that
owner closes. This is not bounded by live invocations; owner-close cleanup is
not proof of campaign-scale memory behavior or the original Workerd OOM cause.
Per-invocation disposal would require a separate authoritative joined lifetime
boundary; neither per-turn cleanup nor a TTL is introduced here.

Verification: actual Host-owned component check
`vibe-provider-session-focused-20261125d`, expected1.2GiB / hard2GiB /
reserve7.5GiB / LOW, **157/157 tests passed in six files**, Vitest12.92s,
whole unit14.37s, peak809MiB. This includes the installed Codex adapter over
mock403/mockSSE: two separately closed helper connections with one session ID
perform one failed upgrade; another ID negotiates independently; canonical
exact-ID cleanup enables a fresh upgrade. Tests also exercise concurrent gateway
turns and authenticated caller separation, actual mixed Pi generation/helper
identity, canonical cacheRetention:none, native owner joined retirement,
credential wait/resume, transport cancellation and the empty-ID negative.
Pi treats cleanupSessionResources('') as global cleanup; the owner census
therefore excludes empty IDs. Independent review caught and verified both this
hazard and the deterministic-provider identity discrepancy.

No paid/model inference, provider traffic, NPM/install, SDK/build or additional
managed instance was used. Mock-host HTTP is owned loopback traffic only. Full
composition types, campaign-scale retention and actual concurrent Luna request
counts remain unchecked. Initial run a had93 passes and one exhausted faux
response fixture; after correcting its two-response input, c had140 passes.
Final d includes the additional mixed-provider regression and all final code.
Operational configuration/journals/proof are in
`/home/werg/vibe-native-oracles-v21/provider-session-*`; all check units joined
and private Vitest cache retired after completion. Existing V25 source stayed
unchanged; activation belongs to the next graceful pinned release.
