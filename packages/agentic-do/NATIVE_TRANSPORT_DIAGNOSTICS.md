# Native transport error evidence

Pre-edit inventory, Base49aa3e9 (2026-11-25). Original V27 terminated cause stays
OPEN. Retained failed turns at /home/werg/vibe-v28-model-admission-ops show
request errors at02:29:54.401 and02:45:47.198/.213UTC, carrying only Error
message `terminated`. NetworkManager reassociations correlate but do not prove
causality. No model or network probes were made.

- native-model-request-port.ts composes the shared protected port for agent
  vessels and ModelGateway. native-model-provider.ts resolves hosted credentials
  and local-loopback routes, then creates native-model-transport connections.
- native-model-transport.ts owns credential/passthrough/local fetch and websocket
  lifetimes. Before edits, HTTP head failures and ownStream reader failures had
  no diagnostics. Websocket failures had milestones without error codes.
- Pi's shared error-body normalizer keeps message/status/body, dropping cause;
  Codex emits that formatted string on its error message. NativeModelHelperTask
  then retains only errorMessage/stopReason, so downstream ModelGateway/Core
  records cannot recover a SocketError/EAI_AGAIN cause from `terminated` alone.
- Host RPC errors.ts276-309 already preserves cause/system-error fields. Host
  egress streaming fetch emits heads only after upstream headers and forwards
  original reader errors as structured RPC errors. SSE request retries remain
  zero. Undici's response-body failure path emits TypeError('terminated',cause),
  whereas preconnect failures commonly produce fetch-failed/EAI_AGAIN; without
  request-bound original cause this is localization, not proof of the old hop.
- Host workerdManager.ts3424 logs stdout only at verbose level; stderr warns.
  Its recentOutput is only40 lines. Existing console.info transport evidence can
  disappear at runtime retirement. New content-free failure records must use
  the same diagnostic observer and a single warning line, retained by the
  supervisor, before Pi flattens the error.
- Core standalone/reviewer model/pi-provider.ts272-273 calls Pi models.stream
  directly, not this protected transport. Its separate provider normalization
  can still lose causes; this patch does not claim it repairs that path. Direct
  Core model/chat-completion.ts593-601 uses fetchModel, also outside this owner.
  Managed llama/local inference, Python/SGLang and browser-local wllama do not
  call this protected host-credential connection. Native local-loopback DOES,
  so it receives the same diagnostics. This is transport-owner evidence, not a
  provider-policy/retry/serving feature or an original-OOM fix.

Repair scope: extend the existing optional diagnostic fields, retaining bounded
cycle-safe error name/code/syscall/cause metadata, request id, timestamp,
head/body phase, status and delivered byte/chunk counts. No messages, payload,
headers, prompts or credentials. Observer failure cannot replace original thrown
identity. No partial-stream replay or new timeouts. Canonical provider session,
model, task/conversation and attempt correlate the existing owner diagnostics.

Verification: 69 actual component tests PASS (45 existing transport, 17 provider,
7 new error/cancellation controls), unit vibe-native-model-transport-full-20261125b,
603.7 MiB peak. Host-owned Vitest source aliases and exact installed Pi
1.2.0-vibestudio.3 were validated against the Host lock; no cold NPM install,
model request, or network probe. Scoped transitive type checking remains
UNCHECKED: the standalone projection lacks Host SDK export mappings and emits
dependency errors, including existing sessionId declaration discrepancies.
This does not assert a full Base build or standalone Core diagnostic repair.
Original terminated cause remains OPEN; earlier instance audit bytes have
already retired. Audit HTTP500/zero response bytes alone cannot identify DNS.

Follow-up observer safety: bounded own DATA descriptors through at most six
prototype levels skip accessors. A real rejected-fetch regression verifies
getters never run and inherited data codes remain. Final 70/70 tests PASS
(unit vibe-native-model-transport-full-20261125c, 726.3 MiB peak). Scoped
Prettier and syntax lint PASS (zero errors; seven existing advisory warnings).
