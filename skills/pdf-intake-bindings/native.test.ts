import { expect, it } from "vitest";
import { activate } from "../../extensions/pdf-ingest/index.js";
import { makePdf } from "../../extensions/pdf-ingest/pdf/testPdf.js";
import { createPdfIntakeBindings } from "./index.js";
it("reads and rereads a real PDF through the native extension without a caller probe", async () => {
  const unavailable = async () => {
    throw Error("Embedded text requires no artifact storage");
  };
  const extension = await activate({
    storage: {
      mkdir: unavailable,
      readFile: unavailable,
      writeFile: unavailable,
    },
    log: { info() {} },
    health: { healthy() {}, degraded() {} },
  });
  const bytes = makePdf([
    "BT",
    "/F1 12 Tf",
    "36 150 Td (Loading bay width 3400 mm) Tj",
    "ET",
  ]);
  const binding = createPdfIntakeBindings(
    extension,
    {
      document: "assigned",
      pages: [1],
      batchSize: 1,
      purpose: "layout",
      allowOcr: false,
    },
    bytes,
  );
  const first = await binding.pdfIntakeRead.read("assigned", [1], "embedded");
  expect(
    first.pages[0]?.lines.some((line) =>
      line.text.includes("Loading bay width 3400 mm"),
    ),
  ).toBe(true);
  expect(await binding.pdfIntakeRead.read("assigned", [1], "embedded")).toEqual(
    first,
  );
  await expect(
    binding.pdfIntakeRead.read("different", [1], "embedded"),
  ).rejects.toThrow("assigned PDF reference");
});
