import type {
  BatchReceipt,
  Citation,
  ExtractedPage,
  Locator,
  ProbeReceipt,
} from "./types.js";

export function completeSelection(
  pages: number[],
  probe: ProbeReceipt,
): boolean {
  return (
    pages.length > 0 &&
    new Set(pages).size === pages.length &&
    pages.every(
      (number) =>
        Number.isInteger(number) &&
        number >= 1 &&
        number <= probe.pageCount &&
        probe.selectedPages.includes(number),
    )
  );
}

export function batches(pages: number[], size: number): number[][] {
  if (!Number.isSafeInteger(size) || size < 1)
    throw new Error("Use a positive PDF batch size.");
  const result: number[][] = [];
  const count = Math.ceil(pages.length / size);
  for (let index = 0; index < count; index++) {
    const start = index * size;
    result.push(pages.slice(start, start + size));
  }
  return result;
}

export function matchesBatch(
  digest: string,
  assigned: number[],
  receipt: BatchReceipt,
): boolean {
  return (
    receipt.digest === digest &&
    receipt.pages.length === assigned.length &&
    new Set(receipt.pages.map((page) => page.number)).size ===
      assigned.length &&
    receipt.pages.every((page) => assigned.includes(page.number))
  );
}

export function citations(
  pages: ExtractedPage[],
  locations: Locator[],
): Citation[] {
  const result: Citation[] = [];
  for (const location of locations) {
    if (
      result.some(
        (item) => item.page === location.page && item.line === location.line,
      )
    )
      continue;
    const line = pages.find((page) => page.number === location.page)?.lines[
      location.line
    ];
    if (!line || !line.text.trim()) continue;
    result.push({
      page: location.page,
      line: location.line,
      quote: line.text,
      bounds: line.bounds,
      source: line.source,
      confidence: line.confidence,
    });
  }
  return result;
}
