# Automations: what is natural language and what is crisp

Ported sub-procedures: choosing the executor of an automation, and reading a scheduling request into a trigger.
This package produces proposals. The mounted [automation lifecycle workflow](../automation-lifecycle/DECOMPOSITION.md)
applies a caller-assigned pause or resume through the normal Missions client and verifies the current state.

| Part | Form | Why |
| --- | --- | --- |
| Which of notify, prompt, tool, watch, eval, method runs each time | own function, `chooseExecutor`, `readout: decision` | A six-way finite choice from the words of a request. One scoring pass, a probability vector, and a scorer that is exact match. The rules are the skill's "Choose the executor" list, in the order a reader applies them. |
| Reading cadence, time of day, weekdays, timezone, end condition out of a sentence | own function, `readSchedule`, typed `ScheduleReading` | Interpretation of free text. It returns what the words say (interval or calendar, 24-hour time, weekday names, "for the next two weeks" as a number of days) and nothing computed. |
| Cron expression, `everyMs`, minimum cadence | crisp helper `toTrigger` | Exact. A small model that writes `"5 5 * * THU"` or `1788235200000` itself will sometimes be wrong; the same fields in a typed reading are right or wrong as meaning, never as arithmetic. |
| Local end date to a UTC epoch instant, DST-correct | crisp helper (`startOfDay`, `followingDay`) | The skill states the trap (`untilAt` is UTC, not local time, and exclusive). Intl offset arithmetic is exact work. |
| Relative end ("for the next two weeks") | crisp (`now + forDays`) | `now` is an argument, so the arithmetic is reproducible. |
| Rejecting a reading it cannot honour (hour 25, no `everyMinutes`, weekdays and day-of-month together) | crisp `ScheduleError` with a sentence that names the fix | Teach in errors. The caller (the agent) sees the message and corrects its request; there is no retry loop here. |
| `launch_automation`, conversation mode, declared operations, authority | stays with the agent | Consequential effect and host-derived authority. The program returns a trigger; the agent commits it. |

Executor identity and gates are in `suite.ts`. A result below the gate leaves that function agent-executed and `SKILL.md` unchanged for it.

## Measurement

Executor: LFM3-1.7B Q8_0 on natlang's llama.cpp fork (b12067), CPU, decision readout where the function declares one. Gates for porting: mean quality of at least 0.85 on the validation split and on the locked test split of `suite.ts` / `cases.jsonl` (chooseExecutor 8/6/6, extractSchedule 8/4/4 train/validation/test).

Status: **not measured to a gate; both functions stay agent-executed, and SKILL.md keeps the agent procedure. `toTrigger` (the crisp part) is unit-tested in `schedule.test.ts`.**

Why the baseline is incomplete: on the host this was built on (load average 17-30 from other agents' model servers) a decision call costs three cold prefills of a ~3.9k-token opening, about 11-16 minutes, because the scorer sends each candidate reply as its own request and the slots do not share the prefix; the whole split set would take about a day. Two defects in the evaluation path also have to be repaired before `pnpm natlang:eval` can produce these numbers: the evaluation worker (`ts-host/src/evaluation/worker-entry.ts`) hands the runtime a bare turn function, and the CLI/driver in `scripts/natlang-eval.mjs` and `cli/adaptation.ts` pass `executor.turn` only, so a `readout: decision` call reports `decision_readout: unavailable ("model driver cannot score replies")` and runs as a full tool loop. The figures here come from an in-process scratch harness that keeps the readout and uses the suite's own cases, fixture and scorer.

Reference model (the agent's own): not measured; no agent-class model is available in the harness. The case labels were written by the agent-class model from the skill text.

## Shared automation workflow

The top-level Vibestudio workflow can call `prepareAutomation` as an installed
domain. It branches between launch planning, lifecycle control, and ledger
inspection. It reuses the existing executor and calendar readers and the exact
`toTrigger` helper. Typed stages choose conversation continuity, declare
operations from the caller's inventory, review launch feasibility, disambiguate
a visible automation and interpret its original run status. The existing host
launch and control tools retain final admission and effects.

## Review an assigned live automation

An owner-scoped automation review reads the assigned roster and concrete
definition revisions through the Missions adapter. It reuses the existing
planner, including its target disambiguation and run-ledger interpretation.
A usable plan is checked against a second live observation before handoff.

| Part | Form | Why |
| --- | --- | --- |
| Establish the live roster and the later readback | `observePlanningState` with a read-only service | The caller supplies one opaque assignment and the service owns its workspace and mission scope. |
| Interpret the request and select the existing mission | Existing `prepareAutomation` tree | Resolving ambiguous names, interpreting lifecycle intent, and explaining failures are shared planning policy. |
| Decide whether the plan can be handed back | `checkHandoff` | Holds and new launches cannot support an existing-mission handoff. A changed roster or revision invalidates the prior decision. |
| Compare mission identities, revisions and run state | `checkSnapshot` TypeScript helper | These are exact observations. Ordering of otherwise identical records does not change the roster. |
