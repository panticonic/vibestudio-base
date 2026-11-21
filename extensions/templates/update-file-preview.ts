import { boundedTemplateUpdatePreview } from "@workspace/vcs-engine";

const largePreview = "[File exceeds the 128 KiB preview limit]";
export const binaryTemplateUpdatePreview = "[Binary file]";

export function previewTemplateUpdateContent(
  content: string | Uint8Array,
): string {
  const result = boundedTemplateUpdatePreview(content);
  if (result.status === "text") return result.text;
  return result.status === "too-large"
    ? largePreview
    : binaryTemplateUpdatePreview;
}
