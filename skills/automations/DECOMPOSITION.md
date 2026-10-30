# Automations: what is natural language and what is crisp

Ported sub-procedures: choosing the executor of an automation, and reading a scheduling request into a trigger.
Everything that commits (`launch_automation`, `control_automation`) stays with the agent: a program here returns a proposal.

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
