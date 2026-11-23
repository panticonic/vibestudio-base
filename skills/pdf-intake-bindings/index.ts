import type { Api } from "../../extensions/pdf-ingest/index.js";
import {
  batches,
  completeSelection,
  matchesBatch,
} from "@workspace-skills/pdf-intake/checks";
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

/** Bind the canonical extension to one content snapshot and authorized page scope. */
export function createPdfIntakeBindings(
  extension: Pick<Api, "probe" | "ingest">,
  assignment: Assignment,
  documentBytes: Uint8Array,
) {
  const scope = { ...assignment, pages: [...assignment.pages] };
  const bytes = new Uint8Array(documentBytes);
  batches(scope.pages, scope.batchSize); // Validate the assigned extraction budget.
  let probeFlight: Promise<ProbeReceipt> | undefined;
  const reads = new Map<string, Promise<BatchReceipt>>();

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
    const pending = (probeFlight ??= readProbe());
    let receipt: ProbeReceipt;
    try {
      receipt = await pending;
    } catch (error) {
      if (probeFlight === pending) probeFlight = undefined;
      throw error;
    }
    return { ...receipt, selectedPages: [...receipt.selectedPages] };
  }

  async function read(
    document: string,
    pages: number[],
    mode: ExtractionMode,
  ): Promise<BatchReceipt> {
    assertDocument(document);
    const assigned = [...pages];
    if (
      !assigned.length ||
      assigned.length > scope.batchSize ||
      new Set(assigned).size !== assigned.length ||
      assigned.some((page) => !scope.pages.includes(page))
    )
      throw new Error(
        "Read only assigned PDF pages within the extraction batch budget.",
      );
    const key = JSON.stringify({ pages: assigned, mode });
    const previous = reads.get(key);
    if (previous) return structuredClone(await previous);
    const pending = (async () => {
      const observed = await probe(document);
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
      return receipt;
    })();
    reads.set(key, pending);
    try {
      return structuredClone(await pending);
    } catch (error) {
      if (reads.get(key) === pending) reads.delete(key);
      throw error;
    }
  }

  return { pdfIntakeProbe: { probe }, pdfIntakeRead: { read } };
}
