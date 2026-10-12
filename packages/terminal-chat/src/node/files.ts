/**
 * `ChatFiles` over the local filesystem of the machine the chat runs on (the
 * workspace runtime): attachments are read relative to `root`, exports are
 * written to `<root>/chat-exports/`.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ChatFiles } from "../runtime/bootstrap.js";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  ts: "text/plain",
  tsx: "text/plain",
  js: "text/javascript",
};

export function mimeTypeFor(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function nodeChatFiles(root: string): ChatFiles {
  return {
    async read(path) {
      if (!path) throw new Error("Type the path of a file to attach.");
      const absolute = isAbsolute(path) ? path : resolve(root, path);
      let info;
      try {
        info = await stat(absolute);
      } catch {
        throw new Error(`There is no file at ${absolute}.`);
      }
      if (!info.isFile()) throw new Error(`${absolute} is not a file.`);
      const bytes = new Uint8Array(await readFile(absolute));
      return { name: basename(absolute), mimeType: mimeTypeFor(absolute), bytes };
    },
    async writeExport(fileName, contents) {
      const directory = join(root, "chat-exports");
      await mkdir(directory, { recursive: true });
      const path = join(directory, fileName);
      await writeFile(path, contents, "utf8");
      return path;
    },
  };
}
