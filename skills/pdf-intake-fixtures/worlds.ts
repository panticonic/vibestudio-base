import type {
  BatchReceipt,
  ExtractedPage,
  ExtractionMode,
  PdfIntakeReport,
  PdfIntakeRequest,
  ProbeReceipt,
} from "../pdf-intake/types.js";

type Options = {
  pages?: number[];
  batchSize?: number;
  purpose?: PdfIntakeRequest["purpose"];
  allowOcr?: boolean;
  probe?: Partial<ProbeReceipt>;
  batches?: (ExtractedPage[] | "interrupted" | "wrong-digest")[];
  calls?: ExtractionMode[];
  expected: {
    status: PdfIntakeReport["status"];
    read: number[];
    quotes: string[];
    unanswered?: string[];
  };
};

function page(number: number, ...lines: string[]): ExtractedPage {
  return {
    number,
    lines: lines.map((text, position) => ({
      text,
      bounds: [30, 120 - position * 12, 100, 10],
      source: "embedded-text",
      confidence: 1,
    })),
  };
}

function ocrPage(number: number, text: string): ExtractedPage {
  return {
    number,
    lines: [
      { text, bounds: [36, 48, 104, 12], source: "ocr", confidence: 0.92 },
    ],
  };
}

function world(
  slug: string,
  group: string,
  goal: string,
  query: string,
  options: Options,
) {
  const digest = "owned-digest-" + slug;
  const pages = options.pages ?? [1];
  const request: PdfIntakeRequest = {
    goal,
    query,
    pages,
    document: "assigned-" + slug,
    batchSize: options.batchSize ?? 2,
    purpose: options.purpose ?? "text",
    allowOcr: options.allowOcr ?? false,
  };
  const probe: ProbeReceipt = {
    digest,
    pageCount: 8,
    selectedPages: pages,
    encrypted: false,
    embedded: true,
    localOcr: true,
    ...options.probe,
  };
  const receipts: (BatchReceipt | "interrupted")[] = (
    options.batches ?? []
  ).map((result) => {
    if (result === "interrupted") return result;
    if (result === "wrong-digest")
      return {
        digest: "different-document",
        pages: [page(3, "Archived drawing")],
      };
    return { digest, pages: result };
  });
  return {
    id: "pdf-intake-" + slug,
    sourceGroup: "vibestudio:pdf-ingest:" + group,
    request,
    probe,
    receipts,
    calls: options.calls ?? [],
    expected: options.expected,
  };
}

export const pdfIntakeWorlds = [
  world(
    "handover-date",
    "embedded",
    "Cite the quoted handover date from the selected drawing note.",
    "Walkthrough 14 June",
    {
      batches: [[page(1, "Drawing notes", "Walkthrough 14 June")]],
      calls: ["embedded"],
      expected: {
        status: "verified",
        read: [1],
        quotes: ["Walkthrough 14 June"],
      },
    },
  ),
  world(
    "cross-page-table",
    "layout",
    "Find the two labeled capacity limits in their source order.",
    "Ramp load; Lift load",
    {
      purpose: "layout",
      pages: [4, 2, 6],
      batchSize: 2,
      calls: ["embedded", "embedded"],
      batches: [
        [page(4, "Ramp load 500 kg"), page(2, "Drawing assumptions")],
        [page(6, "Lift load 420 kg")],
      ],
      expected: {
        status: "verified",
        read: [4, 2, 6],
        quotes: ["Ramp load 500 kg", "Lift load 420 kg"],
      },
    },
  ),
  world(
    "partial-question",
    "missing-claim",
    "Check the specified approval and handoff lines.",
    "Approved by Facilities; Release signature",
    {
      batches: [[page(1, "Approved by Facilities", "Issued for review")]],
      calls: ["embedded"],
      expected: {
        status: "partial-match",
        read: [1],
        quotes: ["Approved by Facilities"],
        unanswered: ["Release signature"],
      },
    },
  ),
  world(
    "empty-selection",
    "selected-pages",
    "Hold the intake because no source page was assigned.",
    "Owner",
    {
      pages: [],
      expected: {
        status: "missing-pages",
        read: [],
        quotes: [],
        unanswered: ["Owner"],
      },
    },
  ),
  world(
    "missing-appendix",
    "selected-pages",
    "Check an appendix page that may be missing from the current PDF.",
    "Material certificate",
    {
      pages: [3, 9],
      probe: { selectedPages: [3] },
      expected: {
        status: "missing-pages",
        read: [],
        quotes: [],
        unanswered: ["Material certificate"],
      },
    },
  ),
  world(
    "duplicate-selection",
    "selected-pages",
    "Require an unambiguous page assignment for the cited drawing.",
    "Plan revision",
    {
      pages: [2, 2],
      probe: { selectedPages: [2] },
      expected: {
        status: "missing-pages",
        read: [],
        quotes: [],
        unanswered: ["Plan revision"],
      },
    },
  ),
  world(
    "encrypted",
    "protected-pdf",
    "Check whether the selected supplier packet can be read locally.",
    "Delivery date",
    {
      probe: { encrypted: true, selectedPages: [], pageCount: 0 },
      expected: {
        status: "encrypted",
        read: [],
        quotes: [],
        unanswered: ["Delivery date"],
      },
    },
  ),
  world(
    "embedded-unavailable",
    "local-engine",
    "Identify the blocker to reading a local certificate.",
    "Signed field",
    {
      probe: { embedded: false },
      expected: {
        status: "engine-unavailable",
        read: [],
        quotes: [],
        unanswered: ["Signed field"],
      },
    },
  ),
  world(
    "ocr-without-authorization",
    "local-engine",
    "Read the scan only when the caller has approved local OCR.",
    "Room 403",
    {
      purpose: "ocr",
      expected: {
        status: "engine-unavailable",
        read: [],
        quotes: [],
        unanswered: ["Room 403"],
      },
    },
  ),
  world(
    "ocr-engine-unavailable",
    "local-engine",
    "Read the scan with bundled OCR when available.",
    "Inspection stamp",
    {
      purpose: "ocr",
      allowOcr: true,
      probe: { localOcr: false },
      expected: {
        status: "engine-unavailable",
        read: [],
        quotes: [],
        unanswered: ["Inspection stamp"],
      },
    },
  ),
  world(
    "ocr-stamp",
    "forced-ocr",
    "Read the visible stamp using local OCR.",
    "Inspection stamp",
    {
      purpose: "ocr",
      allowOcr: true,
      batches: [[ocrPage(1, "Inspection stamp 21B")]],
      calls: ["local-ocr"],
      expected: {
        status: "verified",
        read: [1],
        quotes: ["Inspection stamp 21B"],
      },
    },
  ),
  world(
    "sparse-layout",
    "sparse-layout",
    "Preserve drawing geometry and use local OCR for the sparse caption.",
    "Mechanical room",
    {
      purpose: "layout",
      allowOcr: true,
      calls: ["local-fallback"],
      batches: [[ocrPage(1, "Mechanical room B3")]],
      expected: {
        status: "verified",
        read: [1],
        quotes: ["Mechanical room B3"],
      },
    },
  ),
  world(
    "layout-without-ocr",
    "sparse-layout",
    "Read embedded captions even when the optional OCR engine is unavailable.",
    "Pump room",
    {
      purpose: "layout",
      allowOcr: true,
      probe: { localOcr: false },
      calls: ["embedded"],
      batches: [[page(1, "Pump room A4")]],
      expected: { status: "verified", read: [1], quotes: ["Pump room A4"] },
    },
  ),
  world(
    "wrong-source-midway",
    "batch-identity",
    "Keep a verified drawing caption if a later batch comes from a different document.",
    "Current drawing; Archived drawing",
    {
      pages: [1, 3, 5],
      batchSize: 1,
      calls: ["embedded", "embedded"],
      batches: [[page(1, "Current drawing B")], "wrong-digest"],
      expected: {
        status: "incomplete",
        read: [1],
        quotes: ["Current drawing B"],
        unanswered: ["Archived drawing"],
      },
    },
  ),
  world(
    "repeated-page-in-batch",
    "batch-identity",
    "Check that a batch covering two pages actually includes both assigned pages.",
    "Installation note",
    {
      pages: [1, 2, 3],
      calls: ["embedded"],
      batches: [[page(1, "Installation note"), page(1, "Repeated page")]],
      expected: {
        status: "incomplete",
        read: [],
        quotes: [],
        unanswered: ["Installation note"],
      },
    },
  ),
  world(
    "read-interrupted",
    "batch-settlement",
    "Cite what was read before the decoder was interrupted.",
    "Bolts; Fastener grade",
    {
      pages: [1, 2],
      batchSize: 1,
      calls: ["embedded", "embedded"],
      batches: [[page(1, "Bolts 8 mm")], "interrupted"],
      expected: {
        status: "incomplete",
        read: [1],
        quotes: ["Bolts 8 mm"],
        unanswered: ["Fastener grade"],
      },
    },
  ),
  world(
    "no-matching-line",
    "missing-claim",
    "Check the drawing for explicit acoustic limits.",
    "Acoustic limit",
    {
      batches: [[page(1, "Proposed slab thickness 30 mm")]],
      calls: ["embedded"],
      expected: {
        status: "no-match",
        read: [1],
        quotes: [],
        unanswered: ["Acoustic limit"],
      },
    },
  ),
];
