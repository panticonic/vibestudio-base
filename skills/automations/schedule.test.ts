import { describe, expect, it } from "vitest";
import { ScheduleError, toTrigger } from "./schedule.js";
import type { ScheduleReading } from "./types.js";

const reading = (patch: Partial<ScheduleReading>): ScheduleReading => ({
  cadence: "calendar",
  everyMinutes: null,
  hour: null,
  minute: null,
  weekdays: [],
  dayOfMonth: null,
  timezone: null,
  lastDay: null,
  forDays: null,
  maxRuns: null,
  ...patch,
});
const defaults = { timezone: "America/Sao_Paulo", now: "2026-10-30T12:00:00Z" };

describe("toTrigger", () => {
  it("builds the cron trigger the skill documents for Thursdays at 05:05 New York time", () => {
    expect(
      toTrigger(reading({ hour: 5, minute: 5, weekdays: ["THU"], timezone: "America/New_York", maxRuns: 20 }), defaults)
    ).toEqual({ kind: "cron", expression: "5 5 * * THU", timezone: "America/New_York", maxRuns: 20 });
  });

  it("applies the caller's timezone when the request names none", () => {
    expect(toTrigger(reading({ hour: 9, minute: 0 }), defaults)).toMatchObject({ timezone: "America/Sao_Paulo", expression: "0 9 * * *" });
  });

  it("converts a local end date to the exclusive UTC instant after that day", () => {
    const trigger = toTrigger(
      reading({ hour: 5, minute: 5, weekdays: ["THU"], timezone: "America/New_York", lastDay: "2026-08-31" }),
      defaults
    );
    expect(trigger).toMatchObject({ untilAt: Date.UTC(2026, 8, 1, 4, 0, 0) });
  });

  it("survives a daylight-saving change on the following day", () => {
    // New York springs forward on 2026-03-08: the day after 03-07 starts at 05:00 UTC.
    const trigger = toTrigger(reading({ hour: 8, minute: 0, timezone: "America/New_York", lastDay: "2026-03-07" }), defaults);
    expect(trigger).toMatchObject({ untilAt: Date.UTC(2026, 2, 8, 5, 0, 0) });
  });

  it("counts a relative end from now", () => {
    expect(toTrigger(reading({ cadence: "interval", everyMinutes: 120, forDays: 14 }), defaults)).toEqual({
      kind: "schedule",
      everyMs: 7_200_000,
      untilAt: Date.parse("2026-10-30T12:00:00Z") + 14 * 86_400_000,
    });
  });

  it("takes the earlier of two end conditions", () => {
    const trigger = toTrigger(reading({ cadence: "interval", everyMinutes: 60, forDays: 2, lastDay: "2030-01-01" }), defaults);
    expect(trigger).toMatchObject({ untilAt: Date.parse("2026-10-30T12:00:00Z") + 2 * 86_400_000 });
  });

  it("keeps a manual schedule manual", () => {
    expect(toTrigger(reading({ cadence: "manual" }), defaults)).toEqual({ kind: "manual" });
  });

  it("refuses what cron cannot say, with the fix in the message", () => {
    expect(() => toTrigger(reading({ hour: 25 }), defaults)).toThrow(/hour must be a whole number from 0 to 23/u);
    expect(() => toTrigger(reading({ hour: 9, weekdays: ["MON"], dayOfMonth: 1 }), defaults)).toThrow(/either weekdays or dayOfMonth/u);
    expect(() => toTrigger(reading({ cadence: "interval", everyMinutes: 0 }), defaults)).toThrow(/minimum cadence is one minute/u);
    expect(() => toTrigger(reading({ cadence: "interval" }), defaults)).toThrow(ScheduleError);
    expect(() => toTrigger(reading({ hour: 9, timezone: "Mars/Olympus" }), defaults)).toThrow(/not an IANA timezone/u);
    expect(() => toTrigger(reading({ hour: 9, lastDay: "2026-02-30" }), defaults)).toThrow(/not a real calendar date/u);
  });
});
