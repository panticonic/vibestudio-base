import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  canonicalJson,
  sha256HexSyncText,
} from "@vibestudio/content-addressing";
import type { ExtensionContextLike } from "./context.js";

export type TemplateOperationStep = {
  method: string;
  args: unknown[];
  done: boolean;
  result?: unknown;
};
export type TemplateOperation = {
  request: { commandId: string };
  steps: Record<string, TemplateOperationStep>;
};
export const operationIdentity = (value: unknown) =>
  sha256HexSyncText(canonicalJson(value));

/** Persist effect arguments before dispatch and reuse them after an uncertain response. */
export class TemplateOperations<T extends TemplateOperation> {
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(
    private readonly ctx: ExtensionContextLike,
    private readonly directory: string,
  ) {}
  private file(id: string) {
    return path.join(
      this.ctx.storage.root,
      this.directory,
      `${operationIdentity(id)}.json`,
    );
  }
  async save(operation: T) {
    const destination = this.file(operation.request.commandId);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(`${destination}.next`, JSON.stringify(operation));
    await fs.rename(`${destination}.next`, destination);
  }
  async load(id: string): Promise<T> {
    return JSON.parse(await fs.readFile(this.file(id), "utf8")) as T;
  }
  async serial<R>(id: string, action: () => Promise<R>): Promise<R> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.queues.set(id, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(id) === next) this.queues.delete(id);
    }
  }
  async step<R>(
    operation: T,
    key: string,
    method: string,
    args: unknown[],
    invoke?: (args: unknown[]) => Promise<R>,
  ): Promise<R> {
    let record = operation.steps[key];
    if (!record) {
      record = { method, args, done: false };
      operation.steps[key] = record;
      await this.save(operation);
    }
    if (record.method !== method)
      throw new Error("Template operation step changed identity");
    if (!record.done) {
      record.result = invoke
        ? await invoke(record.args)
        : await this.ctx.rpc.call("main", record.method, ...record.args);
      record.done = true;
      await this.save(operation);
    }
    return record.result as R;
  }
}
