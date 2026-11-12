/** Read-only facts for a draft: the report destination, and one bounded invocation diagnostic when evidence names one. */
import { gad, problemReports } from "natlang:services";
import type { Evidence, Facts } from "../types.js";

export default async function facts(evidence: Evidence): Promise<Facts> {
  const available = await problemReports.availability();
  const gaps: string[] = [];
  let diagnostic = "";
  if (evidence.invocation) {
    try {
      const packet = await gad.diagnoseInvocation({
        ...evidence.invocation,
        eventLimit: 20,
        commandLimit: 20,
        effectLimit: 50,
      });
      const row = packet.invocation;
      diagnostic = row
        ? [
            `invocation ${row.invocation_id}: status ${row.status}`,
            `terminal outcome ${row.terminal_outcome ?? "none"}`,
            `reason code ${row.terminal_reason_code ?? "none"}`,
            `${packet.events.length} events, ${packet.commands.length} commands read`,
          ].join("; ")
        : `invocation ${evidence.invocation.invocationId} has no projected row`;
    } catch (cause) {
      gaps.push(
        `invocation diagnostic unavailable: ${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
  }
  return { destination: available.destination, diagnostic, gaps };
}
