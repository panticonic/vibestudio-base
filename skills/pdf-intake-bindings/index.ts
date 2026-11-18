import type { Api } from "../../extensions/pdf-ingest/index.js";
import {
  batches,
  completeSelection,
  matchesBatch,
} from "../pdf-intake/intakeChecks.js";
import type {
  BatchReceipt,
  ExtractionMode,
  PdfIntakeRequest,
  ProbeReceipt,
} from "../pdf-intake/types.js";

type Assignment = Pick<
  PdfIntakeRequest,
  "document" | "pages" | "batchSize" | "purpose" | "allowOcr"
>;

/** Bind the canonical extension to exactly one content snapshot and page sequence. */
export function createPdfIntakeBindings(
  extension: Pick<Api, "probe" | "ingest">,
  assignment: Assignment,
  documentBytes: Uint8Array,
) {
  const scope = { ...assignment, pages: [...assignment.pages] };
  const bytes = new Uint8Array(documentBytes);
  const sequence = batches(scope.pages, scope.batchSize);
  let probeFlight: Promise<ProbeReceipt> | undefined;
  let verifiedBatches = 0;
  let reading = false;
  let failed = false;

  function assertDocument(document: string): void {
    if (!scope.document || document !== scope.document)
      throw new Error("Use the caller's assigned PDF reference.");
  }

  async function readProbe() {
    const result = await extension.probe(bytes, { pages: [...scope.pages] });
    const available = (id: string) =>
      result.engines.some(
        (engine) => engine.id === id && engine.available && engine.bundled,
      );
    return {
      digest: result.document.digest,
      pageCount: result.document.pageCount,
      selectedPages: [...result.selectedPages],
      encrypted: result.document.encrypted,
      embedded: available("pdfjs"),
      localOcr: available("tesseract-ocr"),
    };
  }

  async function probe(document: string): Promise<ProbeReceipt> {
    assertDocument(document);
    const receipt = await (probeFlight ??= readProbe());
    return { ...receipt, selectedPages: [...receipt.selectedPages] };
  }

  async function read(
    document: string,
    pages: number[],
    mode: ExtractionMode,
  ): Promise<BatchReceipt> {
    assertDocument(document);
    const assigned = sequence[verifiedBatches];
    if (
      !probeFlight ||
      reading ||
      failed ||
      !assigned ||
      pages.length !== assigned.length ||
      pages.some((page, index) => page !== assigned[index])
    ) {
      throw new Error(
        "Read the next assigned PDF batch only after probing the document.",
      );
    }
    reading = true;
    try {
      const observed = await probeFlight;
      if (
        observed.encrypted ||
        !observed.embedded ||
        !completeSelection(scope.pages, observed)
      ) {
        throw new Error("The assigned PDF or page selection is unavailable.");
      }
      const canOcr = scope.allowOcr && observed.localOcr;
      if (
        mode === "local-ocr"
          ? !canOcr || scope.purpose !== "ocr"
          : mode === "local-fallback"
            ? !canOcr || scope.purpose !== "layout"
            : mode !== "embedded" || scope.purpose === "ocr"
      ) {
        throw new Error(
          "Use a local PDF extraction mode authorized by the assignment and probe.",
        );
      }
      const result = await extension.ingest(bytes, {
        pages: [...assigned],
        preserveLayout: true,
        engine: mode === "local-ocr" ? "ocr-only" : "pdfjs",
        ocrFallback: mode === "local-fallback",
        pageImages: "never",
      });
      if (
        mode === "local-ocr" &&
        result.pages.some(
          (page) =>
            page.extractionMethod !== "ocr" &&
            page.extractionMethod !== "mixed",
        )
      )
        throw new Error(
          "The PDF extension could not confirm OCR for every assigned page.",
        );
      const receipt = {
        digest: result.document.digest,
        pages: result.pages.map((page) => ({
          number: page.pageNumber,
          lines: page.lines.map((line) => ({
            text: line.text,
            bounds: [...line.bbox],
            source: line.source,
            confidence: line.confidence,
          })),
        })),
      };
      if (!matchesBatch(observed.digest, assigned, receipt)) {
        throw new Error(
          "The PDF batch receipt does not match the selected digest and pages.",
        );
      }
      verifiedBatches++;
      return receipt;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      reading = false;
    }
  }

  return { pdfIntakeProbe: { probe }, pdfIntakeRead: { read } };
}
