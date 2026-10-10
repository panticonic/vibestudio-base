import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { executeTool } from "../../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import { generateImage } from "../../image-generation.js";
import { createImagegenTool } from "../imagegen.js";
import { createMemoryWorkspaceFileObservationStore } from "../file-observations.js";
import { createAgentFileVisibility } from "../agent-file-visibility.js";
import { StubFs } from "./stub-fs.js";
import { StubVcs } from "./stub-vcs.js";
import { sha256Hex } from "@vibestudio/content-addressing";
import { base64ToBytes } from "../portable-bytes.js";
import type { ToolMutationContext } from "../tool-vcs.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const item = { type: "image_generation_call", id: "ig_test", result: png };
const events = [
  { type: "response.output_item.done", item },
  { type: "response.completed", response: { id: "resp_test", output: [item] } },
];
function setup(inputEvents: unknown[] = events, context: ToolMutationContext = { contextId: "context:test", commandId: "command:image" }) {
  const fs = new StubFs();
  const vcs = new StubVcs();
  const observations = createMemoryWorkspaceFileObservationStore();
  const fetcher = vi.fn(
    async () =>
      new Response(
        inputEvents
          .map((data) => `data: ${JSON.stringify(data)}\r\n\r\n`)
          .join(""),
      ),
  );
  const resolveSession = vi.fn(async () => ({
    model: "gpt-5.5",
    accountId: "account-test",
    fetcher,
  }));
  let request: any;
  let asset: any;
  const rpc = schemaRpcMock({
    call: vi.fn(async (_target: string, method: string, args: any[]) => {
      if (method === "workers.resolveService")
        return durableObjectServiceFixture("do:images", { source: "workers/images",
          className: "ImagesDO",
          objectKey: "default" });
      if (method === "generate") {
        request = args[0];
        return { id: "job:1", status: "queued" };
      }
      if (method === "getJob") {
        const result = await generateImage(
          {
            ...request,
            references: request.references.map(() => ({
              base64: png,
              mimeType: "image/png",
            })),
          },
          {
            session: await resolveSession(),
            detectMimeType: async () => "image/png",
          },
        );
        asset = {
          id: "asset:1",
          digest: sha256Hex(base64ToBytes(png)),
          mimeType: "image/png",
          width: 1,
          height: 1,
          byteLength: base64ToBytes(png).length,
          provenance: result.provenance,
        };
        return { id: "job:1", status: "succeeded", asset };
      }
      if (method === "readAsset") return { asset, base64: png };
      if (method === "importAsset") return { id: "reference:1" };
      return "image/png";
    }),
  });
  const tool = createImagegenTool({
    cwd: "/",
    fs,
    vcs,
    observations,
    visibility: createAgentFileVisibility("/", fs),
    context,
    rpc: rpc as never,
  });
  return { tool, fs, vcs, observations, fetcher, resolveSession, rpc };
}
const input = { prompt: "A blue fish", outputPath: "meta/fish.png" };

describe("workspace imagegen", () => {
  it("uses resolved context and authoritative command identity for jobs and reference ownership", async () => {
    const { tool, fs, rpc } = setup(events, {
      contextId: () => "context:actual", commandId: () => "command:native",
    });
    await fs.writeFile("/meta/reference.png", base64ToBytes(png));
    await executeTool(tool, { ...input, referencePaths: ["meta/reference.png"] }, { callId: "provider-call:not-global" });
    expect(rpc.call.mock.calls.find(([, method]) => method === "generate")?.[2][0]).toMatchObject({
      requestId: "context:actual:command:native",
    });
    expect(rpc.call.mock.calls.find(([, method]) => method === "importAsset")?.[2][0]).toMatchObject({
      owner: "tool:command:native",
    });
    expect(rpc.call.mock.calls.find(([, method]) => method === "release")?.[2][0]).toMatchObject({
      assetId: "reference:1", owner: "tool:command:native",
    });
  });
  it("persists the original bytes through semantic VCS and returns native image content", async () => {
    const { tool, vcs, fetcher } = setup();
    const result = await executeTool(tool, input, { callId: "call:image" });
    expect(vcs.readBinary(input.outputPath)).toBe(png);
    expect(vcs.lastEditInput).toMatchObject({
      commandId: "command:image",
      intentSummary: input.prompt,
    });
    expect(result.details).toMatchObject({
      imageId: "ig_test",
      responseId: "resp_test",
      mutation: { status: "applied", storage: "vcs" },
    });
    expect(result.content).toContainEqual({
      type: "image",
      data: png,
      mimeType: "image/png",
    });
    const [url, init] = (
      fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    )[0]!;
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "gpt-5.5",
      tools: [{ type: "image_generation", model: "gpt-image-2" }],
      stream: true,
      store: false,
    });
  });

  it("passes actual reference image pixels through the workspace filesystem", async () => {
    const { tool, fs, fetcher } = setup();
    await fs.writeFile("/meta/reference.png", base64ToBytes(png));
    await executeTool(
      tool,
      {
        ...input,
        referencePaths: ["meta/reference.png"],
      },
      { callId: "call:image" },
    );
    const [, init] = (
      fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    )[0]!;
    expect(JSON.parse(init.body as string).input[0].content[1]).toEqual({
      type: "input_image",
      image_url: `data:image/png;base64,${png}`,
    });
  });

  it("returns a reusable image asset without changing source when outputPath is omitted", async () => {
    const { tool, vcs } = setup();
    const result = await executeTool(
      tool,
      { prompt: "A blue fish" },
      { callId: "call:asset" },
    );
    expect(vcs.lastEditInput).toBeUndefined();
    expect(result.details).toMatchObject({
      asset: { id: "asset:1" },
      jobId: "job:1",
    });
  });

  it("preserves an existing file by default and reports the conflict", async () => {
    const { tool, vcs } = setup();
    vcs.files.set(input.outputPath, "existing");
    const result = await executeTool(tool, input, { callId: "call:image" });
    expect(result.details).toMatchObject({ mutation: { status: "conflict" } });
    expect(vcs.read(input.outputPath)).toBe("existing");
  });

  it("uses read observations when replacement is requested", async () => {
    const { tool, vcs, observations } = setup();
    vcs.files.set(input.outputPath, "changed elsewhere");
    observations.record(
      input.outputPath,
      sha256Hex(new TextEncoder().encode("observed")),
    );
    const result = await executeTool(
      tool,
      {
        ...input,
        createOnly: false,
      },
      { callId: "call:image" },
    );
    expect(result.details).toMatchObject({
      mutation: {
        status: "conflict",
        conflicts: [{ reason: "content-changed" }],
      },
    });
    expect(vcs.read(input.outputPath)).toBe("changed elsewhere");
  });

  it.each([
    [[events[0]], "before completion"],
    [
      [
        {
          type: "response.failed",
          response: { error: { message: "provider failure" } },
        },
      ],
      "provider failure",
    ],
    [[{ type: "error", message: "quota exceeded" }], "quota exceeded"],
    [[{ type: "response.completed", response: { output: [] } }], "received 0"],
  ])(
    "does not author files on incomplete or failed streams",
    async (frames, message) => {
      const { tool, vcs } = setup(frames as unknown[]);
      await expect(
        executeTool(tool, input, { callId: "call:image" }),
      ).rejects.toThrow(message as string);
      expect(vcs.lastEditInput).toBeUndefined();
    },
  );

  it("cancels before credentials, generation, or mutation", async () => {
    const { tool, resolveSession, vcs } = setup();
    await expect(
      executeTool(tool, input, {
        callId: "call:image",
        signal: AbortSignal.abort(new Error("cancelled")),
      }),
    ).rejects.toThrow("cancelled");
    expect(resolveSession).not.toHaveBeenCalled();
    expect(vcs.lastEditInput).toBeUndefined();
  });
});
