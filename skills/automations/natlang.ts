import chooseExecutor from "./chooseExecutor.nl";
import readSchedule from "./readSchedule.nl";
import { toTrigger } from "./schedule.js";
import type { Trigger } from "./types.js";

export { chooseExecutor };

/**
 * Read a scheduling request into the trigger `launch_automation` takes. The
 * small model reads the words; `toTrigger` does the cron and epoch arithmetic
 * and rejects a reading it cannot honour with an error that names the fix.
 */
export async function extractSchedule(request: string, timezone: string, now: string): Promise<Trigger> {
  return toTrigger(await readSchedule(request), { timezone, now });
}
