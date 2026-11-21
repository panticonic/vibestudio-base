const maxPreviewBytes = 128 * 1024;
const largePreview = "[File exceeds the 128 KiB preview limit]";
export const binaryTemplateUpdatePreview = "[Binary file]";

/** Preserve text, using the same byte ceiling for stored blobs and working VCS text. */
export function previewTemplateUpdateContent(
  content: string | Uint8Array,
): string {
  if (typeof content === "string" && content.length > maxPreviewBytes)
    return largePreview;
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  if (bytes.byteLength > maxPreviewBytes) return largePreview;
  if (bytes.includes(0)) return binaryTemplateUpdatePreview;
  try {
    return typeof content === "string"
      ? content
      : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return binaryTemplateUpdatePreview;
  }
}
