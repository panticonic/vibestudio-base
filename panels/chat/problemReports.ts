import { panel, rpc } from "@workspace/runtime";
import { reportSelectedProblem } from "@workspace/runtime/problem-reports";
import type { ChatHostPorts } from "@workspace/agentic-core/chat-store";

/** Problem reports are drafted over the panel's rpc; each coordinate is scoped to this panel. */
export function createPanelProblemReports(): NonNullable<ChatHostPorts["problemReports"]> {
  return {
    report: async (selection) => {
      const coordinate = JSON.stringify({ panelId: panel.slotId, ...selection.coordinate });
      await reportSelectedProblem(rpc, {
        problem: selection.problem,
        source: selection.source,
        coordinate,
        reference: { kind: "message", coordinate },
        value: selection.value,
      });
    },
  };
}
