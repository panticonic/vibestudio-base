import type { PdfIntakeWorld, PdfOperation } from "./oracle.js";

export function createPdfIntakeFixture(world: PdfIntakeWorld) {
  const operations: PdfOperation[] = [];
  return {
    bindings: {
      pdfIntakeProbe: {
        async probe(document: string) {
          if (document !== world.request.document)
            throw new Error("Probe only the assigned PDF.");
          return structuredClone(world.probe);
        },
      },
      pdfIntakeRead: {
        async read(
          document: string,
          pages: number[],
          mode: PdfOperation["mode"],
        ) {
          operations.push({ document, pages: [...pages], mode });
          const receipt = world.receipts[operations.length - 1];
          if (!receipt || receipt === "interrupted")
            throw new Error("Assigned read interrupted.");
          return structuredClone(receipt);
        },
      },
    },
    operations: () => structuredClone(operations),
  };
}
