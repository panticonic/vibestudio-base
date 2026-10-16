import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeChatFiles } from "./files.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "terminal-chat-files-"));
  directories.push(path);
  return path;
}

describe("workspace chat files", () => {
  it("writes the export where the person confirmed and returns that path", async () => {
    const root = await directory();
    const files = nodeChatFiles(root);
    const { path, followUp } = await files.writeExport(
      "chat-exports/conversation.md",
      "complete transcript"
    );
    expect(path).toBe("chat-exports/conversation.md");
    expect(followUp).toMatch(/Download file/u);
    expect(await readFile(join(root, path), "utf8")).toBe("complete transcript");
  });

  it("reads workspace files and rejects an oversized file before allocating its contents", async () => {
    const root = await directory();
    await writeFile(join(root, "note.txt"), "hello 🦊");
    const files = nodeChatFiles(root);
    const note = await files.read("note.txt");
    expect(note.name).toBe("note.txt");
    expect(new TextDecoder().decode(note.bytes)).toBe("hello 🦊");
    const large = await open(join(root, "large.bin"), "w");
    try {
      await large.truncate(8 * 1024 * 1024 + 1);
    } finally {
      await large.close();
    }
    await expect(files.read("large.bin")).rejects.toThrow("larger than 8 MB");
  });

  it("preserves explicit cancellation without creating export data", async () => {
    const root = await directory();
    const abort = new AbortController();
    const reason = new Error("conversation retired");
    abort.abort(reason);
    const files = nodeChatFiles(root);
    await expect(files.read("does-not-exist", { signal: abort.signal })).rejects.toBe(reason);
    await expect(
      files.writeExport("chat-exports/not-written.md", "data", { signal: abort.signal })
    ).rejects.toBe(reason);
    await expect(readFile(join(root, "chat-exports/not-written.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
