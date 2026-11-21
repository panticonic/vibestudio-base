const previewLimit = 128 * 1024;
const encoder = new TextEncoder();

export function boundedTemplateUpdatePreview(
  content: string | Uint8Array,
):
  | { status: "text"; text: string }
  | { status: "too-large" | "binary"; text: null } {
  if (typeof content === "string" && content.length > previewLimit)
    return { status: "too-large", text: null };
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  if (bytes.byteLength > previewLimit)
    return { status: "too-large", text: null };
  if (bytes.includes(0)) return { status: "binary", text: null };
  try {
    const text =
      typeof content === "string"
        ? content
        : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { status: "text", text };
  } catch {
    return { status: "binary", text: null };
  }
}
