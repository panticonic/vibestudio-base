import type { ReceiptState, SourceReceipt } from "../types.js";

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export default function checkReadback(page: SourceReceipt): ReceiptState {
  if (
    (page.session === "browser" && !page.browserApproved) ||
    page.outcome === "blocked"
  )
    return "held";
  if (page.outcome !== "fetched") return "missing";
  if (
    !page.digest ||
    !Number.isInteger(page.size) ||
    page.headBytes !== utf8Bytes(page.head) ||
    page.headBytes > page.size ||
    page.headBytes < 0 ||
    (page.truncated
      ? page.headBytes >= page.size
      : page.headBytes !== page.size)
  )
    return "invalid";
  for (const read of page.reads) {
    if (
      read.digest !== page.digest ||
      !Number.isInteger(read.offset) ||
      !Number.isInteger(read.limit) ||
      read.offset < 0 ||
      read.limit < 1 ||
      read.limit > 32000 ||
      read.bytes < 0 ||
      read.bytes > read.limit ||
      read.bytes !== utf8Bytes(read.text) ||
      read.nextOffset !== read.offset + read.bytes ||
      read.nextOffset > page.size
    )
      return "invalid";
  }
  return "usable";
}
