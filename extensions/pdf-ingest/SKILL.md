---
name: pdf-ingestion
description: Extract text, layout, OCR, page images, metadata, or structure from local PDFs through @workspace-extensions/pdf-ingest.
---

# PDF Ingestion

Use `@workspace-extensions/pdf-ingest` for local PDF work. Do not assume
`pdftotext`, `pdfinfo`, Poppler, or Tesseract are installed on the host. The
extension bundles its own engines and reports their status.

## Fast Path

```ts
import { extensions } from "@workspace/runtime";

const pdf = extensions.use("@workspace-extensions/pdf-ingest");
const result = await pdf.ingest(fileBytes, {
  preserveLayout: true,
  ocrFallback: true,
  pageImages: "on-ocr",
  ocrLanguages: ["eng"],
});

```

Pass the PDF bytes as a `Uint8Array` (from `fs.readFile`, Drive, a tool call, or
any other RPC result) directly to `pdf.ingest(...)`, `pdf.probe(...)`, or
`pdf.renderPage(...)`. RPC carries bytes natively; there is no envelope to build.

## Engine Policy

- Use PDF.js embedded-text extraction first. It is local, bundled, Apache-2.0,
  and returns text items with geometry for line reconstruction.
- Use OCR fallback only for pages with sparse embedded text, or when the user
  asks for OCR. OCR runs locally with Tesseract.js and bundled English trained
  data.
- Treat Docling, vendored Poppler, and provider-native PDF paths as optional
  adapters. Check `await pdf.engines()` before relying on them.
- Do not use cloud OCR unless the user explicitly accepts its privacy and cost
  tradeoff.

## Structure-sensitive documents

For poetry, tables, or other layout-sensitive documents, start with:

```ts
{
  preserveLayout: true,
  ocrFallback: true,
  pageImages: "on-ocr"
}
```

Inspect `pages[].lines` and their geometry instead of relying only on the
flattened text. Use page warnings, confidence, and statistics to find material
that needs review.

## Useful Calls

```ts
await pdf.probe(pdfBytes, { pages: "1-3" });
await pdf.renderPage(pdfBytes, { pageNumber: 2, scale: 2 });
await pdf.readArtifact(page.imageArtifactId);
await pdf.engines({ ocrLanguages: ["eng"] });
```

`ingest` returns:

- `document`: digest, page count, metadata, encryption flag, scanned hint
- `pages`: page text, markdown, line boxes, extraction method, image artifact
  ids, warnings, and text/OCR stats
- `engines`: available bundled and optional engine diagnostics
- `warnings`: document-level fallback notes

## Failure Handling

- If `probe` reports `encrypted: true`, ask for a password-capable follow-up.
  The extension does not accept passwords.
- If OCR language data is missing, the result includes warnings and engine
  diagnostics. Do not silently switch to a cloud provider.
- For long PDFs, first ingest a subset with `pages` or `maxPages`, check the
  quality, then ingest the rest in batches.
