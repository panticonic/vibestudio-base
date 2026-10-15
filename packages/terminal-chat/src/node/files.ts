/**
 * `ChatFiles` over the local filesystem of the machine the chat runs on (the
 * workspace runtime): attachments are read relative to `root`, exports are
 * written to `<root>/chat-exports/`.
 */
import { mkdir, open, writeFile } from "node:fs/promises";
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
    async read(path, options) {
      if (!path) throw new Error("Type the path of a file to attach.");
      const absolute = isAbsolute(path) ? path : resolve(root, path);
      const limit = 8 * 1024 * 1024;
      options?.signal?.throwIfAborted();
      const file = await open(absolute, "r");
      let failure: unknown;
      try {
        const info = await file.stat();
        if (!info.isFile()) throw new Error(`${absolute} is not a file.`);
        if (info.size > limit) throw new Error(`${absolute} is larger than 8 MB.`);
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          options?.signal?.throwIfAborted();
          const chunk = new Uint8Array(Math.min(64 * 1024, limit + 1 - total));
          const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
          options?.signal?.throwIfAborted();
          if (!bytesRead) break;
          total += bytesRead;
          if (total > limit) throw new Error(`${absolute} grew beyond the 8 MB attachment limit.`);
          chunks.push(chunk.subarray(0, bytesRead));
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return {
          name: basename(absolute),
          mimeType: mimeTypeFor(absolute),
          bytes,
        };
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        try {
          await file.close();
        } catch (error) {
          if (failure !== undefined)
            throw new AggregateError([failure, error], "Attachment read and file cleanup failed", {
              cause: failure,
            });
          throw error;
        }
      }
    },
    async writeExport(fileName, contents, options) {
      const directory = join(root, "chat-exports");
      await mkdir(directory, { recursive: true });
      const path = join(directory, fileName);
      try {
        await writeFile(path, contents, {
          encoding: "utf8",
          signal: options?.signal,
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ABORT_ERR" &&
          "cause" in error &&
          error.cause === options?.signal?.reason
        )
          throw error.cause;
        throw error;
      }
      return `chat-exports/${fileName}`;
    },
  };
}
