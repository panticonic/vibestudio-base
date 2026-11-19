import { sha256Hex } from "@vibestudio/content-addressing";
import type { Api } from "../../extensions/pdf-ingest/index.js";
import type {
  PdfLayoutPage,
  PdfLayoutRequest,
} from "../pdf-intake/types.js";

const MAX_FRAGMENTS = 250;
const MAX_FRAGMENT_CHARACTERS = 18000;

export function bindPdfLayout(
  extension: Pick<Api, "ingest">,
  goal: string,
  pageNumber: number,
  documentBytes: Uint8Array,
) {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1)
    throw new Error("Assign a positive PDF page number");
  const bytes = new Uint8Array(documentBytes);
  const digest = sha256Hex(bytes);
  const operationId = crypto.randomUUID();
  const request: PdfLayoutRequest = { goal, operationId };
  let observed: Promise<PdfLayoutPage> | undefined;

  async function read(): Promise<PdfLayoutPage> {
    const output = await extension.ingest(bytes, {
      pages: [pageNumber],
      engine: "pdfjs",
      ocrFallback: false,
      pageImages: "never",
      preserveLayout: true,
      includeTextFragments: true,
    });
    const [page] = output.pages;
    if (
      output.document.encrypted ||
      output.document.digest !== digest ||
      output.pages.length !== 1 ||
      page?.pageNumber !== pageNumber
    )
      throw new Error(
        "The PDF read did not return the assigned digest and page",
      );
    const rows = page.lines.map((line) => {
      if (!line.fragments?.length)
        throw new Error(
          "The assigned page has no exact fragments for a text line",
        );
      return line.fragments.map((fragment) => ({
        text: fragment.text,
        bounds: [...fragment.bbox],
      }));
    });
    const fragments = rows.flat();
    if (
      fragments.some(
        ({ bounds }) => bounds.length !== 4 || !bounds.every(Number.isFinite),
      )
    )
      throw new Error("The PDF returned invalid fragment coordinates");
    if (
      fragments.length > MAX_FRAGMENTS ||
      fragments.reduce((sum, { text }) => sum + text.length, 0) >
        MAX_FRAGMENT_CHARACTERS
    )
      throw new Error("The assigned page exceeds the layout evidence budget");
    return { digest, pageNumber, width: page.width, height: page.height, rows };
  }

  return {
    request,
    services: {
      pdfLayoutRead: {
        async inspect(id: string): Promise<PdfLayoutPage> {
          if (id !== operationId)
            throw new Error("Inspect only the caller's assigned PDF page");
          return structuredClone(await (observed ??= read()));
        },
      },
    },
  };
}
