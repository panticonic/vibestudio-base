# Decomposition: channel health and channel summary

Two functions, both over the `gad` service (read-only inspectors) or pages the agent already read. The old skill said
"start with bounded inspectors, take one snapshot, don't poll", then left the reading of the result to the agent.

Both functions were first written with natural-language judgments, measured on the executor, and then reduced to what
the measurement supported. Both end up crisp; the record below says why, and the suite keeps the cases.

## `inspectAgentHealth(ref): HealthReport` (`inspectAgentHealth.nl`)

| Part | Decision | Why |
|---|---|---|
| One snapshot: `gad.inspectAgentHealth({ channelId, branchId })` | crisp, `inspectAgentHealth/collect.ts` | The outside world, once. The skill forbids polling; the function cannot poll. |
| `integrity` (`durableIntegrityOk`) and `activity` as two independent facts | crisp | `DIAGNOSTICS.md`: they are separate answers, and the caller's own eval is already excluded by the service. |
| List what the snapshot shows (13 finding kinds, each with a count and the facts that decide its meaning) | crisp, `inspectAgentHealth/findings.ts` | Exact counting over typed rows. |
| How soon each finding needs attention: `expected`, `investigate`, `urgent` | crisp table, `inspectAgentHealth/policy.ts` | **Tried as a `readout: decision` function and removed.** The policy of `DIAGNOSTICS.md` is an exact function of the finding's kind (work in progress is not a failure; a duplicate `turn.opened` never heals; every other kind needs an inspector), and age is deliberately not an input: elapsed time alone does not establish failure. The executor did worse than the table (below), and a judgment that is exact over a field is not a judgment. |
| Which inspector explains a finding | crisp lookup, `policy.ts` | A table taken from the skill's own inspector list. |
| `status` | crisp, in `collect.ts` | A consequence of the urgencies and of `integrity`. |

The program makes no model call. It stays a typed function (not prose in `SKILL.md`) so the agent gets the same
interface and the same cited evidence as from the other ports, and so the policy is tested (`gad.test.ts`).

## `summarizeChannel(pages): ChannelSummary` (`summarizeChannel.nl`)

| Part | Decision | Why |
|---|---|---|
| Merge pages by `seq`, count senders and payload kinds, range | crisp, `summarizeChannel/timeline.ts` | The skill's own rule: follow `pageInfo` cursors. Counting is exact. |
| The conversation: only `message.completed` and `message.failed` events, with their text | crisp, `timeline.ts` | Everything else (presence, tool progress, deltas) is counted, not read. A long block arrives as a preview object and is read as its preview. |
| How the conversation stands (`failed`, `awaiting-agent`, `empty`, `agent-replied`) | crisp, `collect.ts` | An exact function of the last message. |
| Does the agent's last message ask the user for something | **stays with the agent** | Tried as a `readout: decision` boolean; the executor read offers ("let me know if you want it on other pages") as requests. |
| What the conversation is about | **stays with the agent** | Tried as a text function. It cost 90-235 s per case on CPU and added nothing the opening and latest text (returned by the summary) do not give the agent for free. |
| Cite the opening and the latest message | crisp | By `seq`, with their text. |

## Effects and services

None. `gad.inspectAgentHealth` only; `summarizeChannel` takes pages the agent already read with
`gad.inspectChannelEnvelopes` (or `collectChannelEnvelopePages`) and calls no service.

## Suite

One suite (`suite.ts`) and one case file (`cases.jsonl`); each case names the function it exercises.

- `inspectAgentHealth`: 16 cases (8 train, 4 validation, 4 test). There is no captured health packet on this machine
  and no system-test run to take one from, so the packets are synthetic: built from the `AgentHealthInspection`
  schema, one per scenario of `DIAGNOSTICS.md`. Each case's `source` says which. Quality is the fraction of findings
  with the expected urgency; gates are `listed` (the findings are exactly the expected kinds) and `status`.
- `summarizeChannel`: 15 cases (7 train, 4 validation, 4 test). Envelope histories are synthetic, shaped like
  `inspectChannelEnvelopes` items with agentic event payloads. Quality is the mean of `counted` and `standing`.

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12068), CPU, decision readouts scored (`sessionDriver`), run
in-process with the suite's own cases, fixture and scorer (see the note in the port report on `pnpm natlang:eval`).
Gates: mean quality of at least 0.85 on validation and on the locked test split.

| Version | Split | Quality | Gate |
|---|---|---|---|
| `inspectAgentHealth` with the decision `urgency` | validation (4) | 0.500 (status right in 2 of 4) | not met |
| | test (4) | 0.458 (status right in 2 of 4) | not met |
| `summarizeChannel` with `needsUserReply` and `topic` | validation (4) | 0.875 (1 wrong state) | met |
| | test (4) | 0.750 (2 wrong states, both an offer read as a request) | not met |
| both, crisp (this version) | validation, test | see the suite: deterministic, every gate met | met |

Reference model (the agent's own): not measured; no agent-class model is available in the harness. Labels were written
by the author from `DIAGNOSTICS.md`.

Port gates for any natural-language step reintroduced here: mean quality of at least 0.85 on validation and on the
locked test split, with `status` / `standing` and the exact counts right on every case.

Agents call the exact children, `inspectAgentHealth.collect(ref)` and `summarizeChannel.collect(pages)`: the carrier
`.nl` files only forward.
