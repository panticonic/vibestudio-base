import { expect, it, vi } from "vitest";
import { createPdfIntakeBindings } from "./index.js";
it("reads any assigned bounded PDF batch without a caller probe, reuses repeats, and rejects foreign pages/modes/digests", async () => {
  const digest = "a".repeat(64);
  const ingest = vi.fn(
    async (_bytes: unknown, { pages }: { pages: number[] }) => ({
      document: { digest },
      pages: pages.map((pageNumber) => ({
        pageNumber,
        extractionMethod: "embedded",
        lines: [],
      })),
    }),
  );
  const extension = {
    probe: vi.fn(async () => ({
      document: { digest, pageCount: 3, encrypted: false },
      selectedPages: [1, 2, 3],
      engines: [{ id: "pdfjs", available: true, bundled: true }],
    })),
    ingest,
  };
  const assignment = {
    document: "owned",
    pages: [1, 2, 3],
    batchSize: 2,
    purpose: "layout",
    allowOcr: false,
  } as const;
  const bound = createPdfIntakeBindings(
    extension as never,
    { ...assignment, pages: [...assignment.pages] },
    new Uint8Array([1]),
  );
  const last = await bound.pdfIntakeRead.read("owned", [3], "embedded");
  const [first, repeat] = await Promise.all([
    bound.pdfIntakeRead.read("owned", [1, 2], "embedded"),
    bound.pdfIntakeRead.read("owned", [3], "embedded"),
  ]);
  expect(repeat).toEqual(last);
  expect(first.pages.map((page) => page.number)).toEqual([1, 2]);
  expect(ingest).toHaveBeenCalledTimes(2);
  expect(extension.probe).toHaveBeenCalledTimes(1);
  await expect(
    bound.pdfIntakeRead.read("foreign", [1], "embedded"),
  ).rejects.toThrow("assigned PDF reference");
  await expect(
    bound.pdfIntakeRead.read("owned", [4], "embedded"),
  ).rejects.toThrow("assigned PDF pages");
  await expect(
    bound.pdfIntakeRead.read("owned", [1, 2, 3], "embedded"),
  ).rejects.toThrow("batch budget");
  await expect(
    bound.pdfIntakeRead.read("owned", [2], "local-ocr"),
  ).rejects.toThrow("authorized");
  await expect(
    bound.pdfIntakeRead.read("owned", [2], "embedded"),
  ).resolves.toMatchObject({ digest });
  ingest.mockImplementationOnce(async () => ({
    document: { digest: "foreign" },
    pages: [{ pageNumber: 1, extractionMethod: "embedded", lines: [] }],
  }));
  await expect(
    bound.pdfIntakeRead.read("owned", [1], "embedded"),
  ).rejects.toThrow("digest and pages");
});
