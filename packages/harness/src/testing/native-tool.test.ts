import { expect, it, vi } from "vitest";
import { Type } from "@panticonic/pi-ai";
import type { ToolRegistration } from "@panticonic/pi-durable";
import { executeTool } from "./native-tool.js";

it("uses retained streamed output when omitted and preserves explicit model output", async () => {
  const bytes = new TextEncoder().encode("receipt 🙂");
  const onOutput = vi.fn();
  const tool: ToolRegistration = {
    name: "stream",
    description: "Stream a receipt",
    parameters: Type.Object({}),
    execute: async (_args, api) => {
      api.output(bytes.slice(0, bytes.length - 2));
      api.output(bytes.slice(bytes.length - 2));
      expect(api.retainedOutput()).toEqual({ text: "receipt 🙂", truncated: false });
      return { details: { done: true } };
    },
  };
  expect(await executeTool(tool, {}, { onOutput })).toEqual({
    output: [{ type: "text", text: "receipt 🙂" }],
    details: { done: true },
  });
  expect(onOutput).toHaveBeenCalledTimes(2);

  tool.execute = async (_args, api) => {
    api.output("progress is not the final model result");
    return { output: [{ type: "text", text: "final receipt" }] };
  };
  expect((await executeTool(tool, {})).output).toEqual([{ type: "text", text: "final receipt" }]);
});
