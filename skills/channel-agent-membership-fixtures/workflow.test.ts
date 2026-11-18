import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { ProgramLoader } from "../../packages/natlang/src/programs.js";
import { confinedRealm } from "../../packages/natlang/src/realm.js";
import { testNewFunction } from "../../packages/natlang/src/testSupport.js";
import {
  createNatlangRuntime,
  workerdPlatform,
} from "../../packages/natlang/vendor/workerd/natlang-workerd.js";
import type {
  ChannelAgentReport,
  ChannelAgentRequest,
} from "../agents/channel-membership/types.js";
import { checkMembershipOutcome, membershipFixture } from "./fixture.js";
import { channelMembershipWorlds } from "./worlds.js";

import { membershipReference } from "./reference.js";

it("executes the membership call tree with only each stage's assigned service", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const platform = workerdPlatform({ realm: confinedRealm(testNewFunction()) });
  const required: Record<string, string[]> = {
    inspect: ["channelAgentRead"],
    attach: ["channelAgentAttach"],
    detach: ["channelAgentDetach"],
  };
  const runtime = createNatlangRuntime({
    platform,
    agent: async (session) => {
      const name = session.lam.functionName ?? "";
      expect(Object.keys(session.availableServices()), name).toEqual(
        required[name] ?? [],
      );
      const code = membershipReference[name];
      if (!code) throw new Error(`No reference for ${name}`);
      const action = await session.applyAsync("eval", { code, finish: true });
      if (action.kind === "rejected") throw new Error(action.text);
    },
  });
  const loader = new ProgramLoader({
    platform,
    bindings: {},
    fs: {
      readFile: (path) => readFile(join(root, path), "utf8"),
      readdir: (path) => readdir(join(root, path), { withFileTypes: true }),
      stat: (path) => stat(join(root, path)),
    },
    runTask: (run, task) => runtime.run(run, task),
  });
  for (const world of channelMembershipWorlds) {
    const fixture = membershipFixture(world);
    const program = (await loader.load(
      "skills/agents/channel-membership/manageChannelAgent.nl",
      {
        services: fixture.services,
      },
    )) as (input: ChannelAgentRequest) => Promise<ChannelAgentReport>;
    const result = await program(world.request);
    const evidence = fixture.evidence();
    expect(result, world.id).toEqual(world.expected);
    expect(checkMembershipOutcome(world, result, evidence), world.id).toBe(
      true,
    );
    expect(
      checkMembershipOutcome(
        world,
        { ...result, participantId: "unrelated" },
        evidence,
      ),
    ).toBe(false);
  }
});

it("serializes duplicate attempts and declines changed channel or replay settings", async () => {
  const world = channelMembershipWorlds[0]!;
  const fixture = membershipFixture(world);
  const { channelAgentAttach, channelAgentRead, channelAgentDetach } =
    fixture.services;
  const request = world.request;
  const options = request.options!;
  await expect(
    channelAgentRead.read({ ...request, contextId: "different-context" }),
  ).rejects.toThrow("assigned");
  await expect(
    channelAgentAttach.attach(request, { ...options, replay: !options.replay }),
  ).resolves.toMatchObject({ outcome: "blocked" });
  await expect(channelAgentDetach.detach(request)).resolves.toMatchObject({
    outcome: "blocked",
  });
  await channelAgentRead.read(request);
  const outcomes = await Promise.all([
    channelAgentAttach.attach(request, options),
    channelAgentAttach.attach(request, options),
  ]);
  expect(outcomes.map((result) => result.outcome)).toEqual([
    "acknowledged",
    "blocked",
  ]);
  await channelAgentRead.read(request);
  expect(fixture.evidence().effects).toEqual([{ kind: "attach", options }]);
});
