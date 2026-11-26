/** Public joint program loading/evaluation controls; no paid model or training trajectory. */
import { expect, it, vi } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { createEvalNatlang } from "./index.js";
import { fakeRpc, testNewFunction, toolCallMessage } from "./testSupport.js";
const base = fileURLToPath(new NodeURL("../../..", import.meta.url));

it("lets the real model-owned investigation compare five conversations without a fixed TS reconsider loop", async () => {
  const rooms = Array.from({ length: 5 }, (_, i) => ({
    id: `room-${i}`,
    title: `Room ${i}`,
    maySend: false,
  }));
  const inspect = vi.fn(async (roomId: string, phrase: string | null) => ({
    room: rooms.find((row) => row.id === roomId)!,
    basis: `native:${roomId}`,
    phrase,
    roster: [],
    resolution: null,
    prior: null,
  }));
  const submit = vi.fn(async () => {
    throw Error("Read-only investigation cannot send");
  });
  const codes = [
    "const conversations=await localDeliveryCatalog.discover();const observations=await investigateLocalDelivery(goal,conversations);const decision=await decideDelivery(goal,observations);return settleLocalDelivery(goal,observations,decision);",
    "const observations=[];for(const room of conversations)observations.push(await inspectConversation({roomId:room.id,recipientPhrase:null}));return observations;",
    'if(observations.length!==5)throw Error("Incomplete requested comparison");return {status:"unconfirmed",reason:"All five owned conversations were inspected; none has the requested retained acknowledgement.",evidence:[],sendRoomId:null};',
  ];
  let turns = 0;
  const { rpc } = fakeRpc({
    turn: async (input) => {
      const code = codes[turns++];
      if (!code)
        throw Error(
          "Unexpected semantic call: " + JSON.stringify(input.context),
        );
      return toolCallMessage(
        "eval",
        { code, finish: true },
        { input: 0, output: 0 },
      );
    },
  });
  const runtime = createEvalNatlang({
    newFunction: testNewFunction(),
    owner: {
      kind: "user",
      objectKey: "local-delivery-model-composition-control",
    },
    bindings: {
      rpc,
      fs: {
        readFile: (path: string) => readFile(join(base, path), "utf8"),
        readdir: (path: string) =>
          readdir(join(base, path), { withFileTypes: true }),
        stat: (path: string) => stat(join(base, path)),
      },
    },
  });
  try {
    const result = await runtime.runCell(
      async () => {
        const natlang = runtime.ambient.natlang as {
          load(path: string, options: object): Promise<unknown>;
        };
        const program = (await natlang.load(
          "skills/open-local-delivery/workTowardLocalDelivery.nl",
          {
            services: {
              localDeliveryCatalog: { discover: async () => rooms },
              localDeliveryHistory: { inspect },
              localDeliverySend: { submit },
              localDeliveryReadback: { read: async () => null },
            },
          },
        )) as (goal: string) => Promise<unknown>;
        return program(
          "Compare the retained acknowledgement in all five owned conversations. Do not send anything.",
        );
      },
      {
        runId: "local-delivery-model-composition-control",
        signal: new AbortController().signal,
      },
    );
    expect(result.value).toEqual({
      status: "unconfirmed",
      reason:
        "All five owned conversations were inspected; none has the requested retained acknowledgement.",
      delivery: null,
    });
    expect(turns).toBe(3);
    expect(inspect.mock.calls).toEqual(rooms.map((room) => [room.id, null]));
    expect(submit).not.toHaveBeenCalled();
  } finally {
    await runtime.close();
  }
}, 180000);
