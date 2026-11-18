import type { ExtractionMode, PdfIntakeReport } from "../pdf-intake/types.js";
import type { pdfIntakeWorlds } from "./worlds.js";

export type PdfIntakeWorld = (typeof pdfIntakeWorlds)[number];
export type PdfOperation = {
  document: string;
  pages: number[];
  mode: ExtractionMode;
};

export function verifyPdfIntake(
  world: PdfIntakeWorld,
  report: PdfIntakeReport,
  operations: PdfOperation[],
): boolean {
  const same = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right);
  if (
    report.digest !== world.probe.digest ||
    report.status !== world.expected.status ||
    !same(report.readPages, world.expected.read) ||
    !same(
      report.remaining,
      world.request.pages.filter((page) => !world.expected.read.includes(page)),
    ) ||
    !same(report.unanswered, world.expected.unanswered ?? []) ||
    !same(
      report.citations.map((citation) => citation.quote),
      world.expected.quotes,
    ) ||
    !same(
      operations.map((operation) => operation.mode),
      world.calls,
    )
  )
    return false;

  for (const [index, operation] of operations.entries()) {
    const offset = index * world.request.batchSize;
    if (
      operation.document !== world.request.document ||
      !same(
        operation.pages,
        world.request.pages.slice(offset, offset + world.request.batchSize),
      )
    )
      return false;
  }
  return report.citations.every((citation) => {
    if (!world.expected.read.includes(citation.page)) return false;
    const source = world.receipts
      .flatMap((receipt) =>
        receipt !== "interrupted" && receipt.digest === world.probe.digest
          ? receipt.pages
          : [],
      )
      .find((page) => page.number === citation.page)?.lines[citation.line];
    return (
      source?.text === citation.quote &&
      source.source === citation.source &&
      source.confidence === citation.confidence &&
      same(source.bounds, citation.bounds)
    );
  });
}
