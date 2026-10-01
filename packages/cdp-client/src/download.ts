import type {
  BrowserAutomationRequest,
  BrowserDownload,
  BrowserDownloadChunk,
} from "@vibestudio/shared/panel/browserAutomation";
export type BrowserOperation = (
  request: BrowserAutomationRequest,
  signal?: AbortSignal,
) => Promise<unknown>;
export class CdpDownload {
  constructor(
    private readonly record: BrowserDownload,
    private readonly operation: BrowserOperation,
  ) {}
  id(): string {
    return this.record.id;
  }
  url(): string {
    return this.record.url;
  }
  suggestedFilename(): string {
    return this.record.filename;
  }
  async info(): Promise<BrowserDownload> {
    return this.operation({
      operation: "downloadInfo",
      id: this.id(),
    }) as Promise<BrowserDownload>;
  }
  async finished(): Promise<void> {
    await this.operation({ operation: "downloadFinished", id: this.id() });
  }
  async cancel(): Promise<void> {
    await this.operation({ operation: "cancelDownload", id: this.id() });
  }
  async readChunk(
    offset: number,
    length = 262144,
  ): Promise<{ bytes: Uint8Array; eof: boolean }> {
    const result = (await this.operation({
      operation: "readDownloadChunk",
      id: this.id(),
      offset,
      length,
    })) as BrowserDownloadChunk;
    return {
      bytes: Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0)),
      eof: result.eof,
    };
  }
  /** Prefer readChunk for large downloads; this convenience method materializes all bytes. */
  async body(): Promise<Uint8Array> {
    await this.finished();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const chunk = await this.readChunk(total);
      chunks.push(chunk.bytes);
      total += chunk.bytes.length;
      if (chunk.eof) break;
      if (!chunk.bytes.length)
        throw new Error(
          "Download provider returned an empty nonterminal chunk",
        );
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
