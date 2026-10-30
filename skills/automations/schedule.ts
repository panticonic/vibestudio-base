import type { ScheduleReading, Trigger } from "./types.js";

/** A reading that cannot become a trigger. The message says what to change. */
export class ScheduleError extends Error {
  override readonly name = "ScheduleError";
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function wholeNumber(value: number, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ScheduleError(`${label} must be a whole number from ${min} to ${max}, not ${value}.`);
  }
  return value;
}

/** Offset of `timezone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const field = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second")
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant at which `day` (YYYY-MM-DD) begins in `timezone`. */
function startOfDay(day: string, timezone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  if (!match) throw new ScheduleError(`lastDay must be a calendar date like 2026-09-01, not "${day}".`);
  const utcMidnight = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(utcMidnight).toISOString().slice(0, 10) !== day) {
    throw new ScheduleError(`lastDay ${day} is not a real calendar date.`);
  }
  // The offset at the guessed instant can differ from the offset at the true start of the day across a DST change.
  const guess = utcMidnight - zoneOffsetMs(utcMidnight, timezone);
  return utcMidnight - zoneOffsetMs(guess, timezone);
}

function followingDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

function checkedTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new ScheduleError(
      `"${timezone}" is not an IANA timezone. Use a name like America/New_York or Europe/Lisbon.`
    );
  }
  return timezone;
}

/**
 * Turn what a request says into the trigger `launch_automation` takes. All
 * date, cron, and epoch arithmetic lives here, so a reader only has to say
 * what the words mean. `defaults.timezone` applies when the request names none;
 * `defaults.now` is the ISO instant that "for the next two weeks" counts from.
 */
export function toTrigger(
  reading: ScheduleReading,
  defaults: { timezone: string; now: string }
): Trigger {
  if (reading.cadence === "manual") return { kind: "manual" };
  const timezone = checkedTimezone(reading.timezone ?? defaults.timezone);
  const now = Date.parse(defaults.now);
  if (Number.isNaN(now)) throw new ScheduleError(`now must be an ISO instant, not "${defaults.now}".`);

  const bounds: number[] = [];
  if (reading.lastDay !== null) {
    startOfDay(reading.lastDay, timezone); // rejects a malformed or unreal date before it is shifted
    bounds.push(startOfDay(followingDay(reading.lastDay), timezone));
  }
  if (reading.forDays !== null) bounds.push(now + wholeNumber(reading.forDays, "forDays", 1, 3650) * DAY_MS);
  const end: { untilAt?: number; maxRuns?: number } = {};
  if (bounds.length > 0) end.untilAt = Math.min(...bounds);
  if (reading.maxRuns !== null) end.maxRuns = wholeNumber(reading.maxRuns, "maxRuns", 1, 1_000_000);

  if (reading.cadence === "interval") {
    if (reading.everyMinutes === null) {
      throw new ScheduleError("An interval schedule needs everyMinutes (2 hours is 120).");
    }
    if (!Number.isInteger(reading.everyMinutes) || reading.everyMinutes < 1) {
      throw new ScheduleError("The minimum cadence is one minute: everyMinutes must be a whole number of at least 1.");
    }
    return { kind: "schedule", everyMs: reading.everyMinutes * MINUTE_MS, ...end };
  }

  if (reading.hour === null) {
    throw new ScheduleError("A calendar schedule needs hour (24-hour time: 5pm is 17).");
  }
  const hour = wholeNumber(reading.hour, "hour", 0, 23);
  const minute = wholeNumber(reading.minute ?? 0, "minute", 0, 59);
  if (reading.dayOfMonth !== null && reading.weekdays.length > 0) {
    throw new ScheduleError(
      "Name either weekdays or dayOfMonth, not both: cron would run on either, not on their intersection."
    );
  }
  const dayOfMonth = reading.dayOfMonth === null ? "*" : String(wholeNumber(reading.dayOfMonth, "dayOfMonth", 1, 31));
  const dayOfWeek = reading.weekdays.length > 0 ? [...new Set(reading.weekdays)].join(",") : "*";
  return {
    kind: "cron",
    expression: `${minute} ${hour} ${dayOfMonth} * ${dayOfWeek}`,
    timezone,
    ...end,
  };
}
