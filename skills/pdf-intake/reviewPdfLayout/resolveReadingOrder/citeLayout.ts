import type {
  PdfFragmentLocation,
  PdfLayoutPage,
  PdfLayoutReading,
} from "../../types.js";

/** Reconstruct the actual text and coordinates at the selected fragment locations. */
export function resolveOrder(
  page: PdfLayoutPage,
  order: PdfFragmentLocation[],
): PdfLayoutReading {
  const available = page.rows.reduce((sum, row) => sum + row.length, 0);
  if (available === 0 || order.length !== available)
    return { status: "uncertain", entries: [] };

  const seen = new Set<string>();
  const entries: PdfLayoutReading["entries"] = [];
  for (const { row, fragment } of order) {
    const part = page.rows[row]?.[fragment];
    const key = row + ":" + fragment;
    if (
      !Number.isSafeInteger(row) ||
      !Number.isSafeInteger(fragment) ||
      !part ||
      seen.has(key)
    )
      return { status: "uncertain", entries: [] };
    seen.add(key);
    entries.push({ row, fragment, ...part });
  }
  return { status: "ordered", entries };
}
