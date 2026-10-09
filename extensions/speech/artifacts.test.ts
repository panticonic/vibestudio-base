import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareArtifacts, artifactId } from "./artifacts.js";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function root() {
  const root = await mkdtemp(path.join(tmpdir(), "whistle-artifacts-"));
  roots.push(root);
  return root;
}
it("rejects corrupt cached code without executing or silently replacing it", async () => {
  const cache = await root();
  await mkdir(path.join(cache, artifactId));
  await writeFile(path.join(cache, artifactId, "needle.cjs"), "tampered");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    prepareArtifacts(cache, new AbortController().signal, () => {}),
  ).rejects.toThrow("checksum");
  expect(fetch).not.toHaveBeenCalled();
});
it("never publishes an unverified download", async () => {
  const cache = await root();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("bad download")),
  );
  await expect(
    prepareArtifacts(cache, new AbortController().signal, () => {}),
  ).rejects.toThrow("checksum");
  expect(await readdir(path.join(cache, artifactId))).toEqual([]);
});
it("propagates caller cancellation into an in-flight download", async () => {
  const cache = await root();
  const controller = new AbortController();
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          started();
        }),
    ),
  );
  const work = prepareArtifacts(cache, controller.signal, () => {});
  const rejected = expect(work).rejects.toThrow("owner disconnected");
  await running;
  controller.abort(new Error("owner disconnected"));
  await rejected;
  expect(await readdir(path.join(cache, artifactId))).toEqual([]);
});
