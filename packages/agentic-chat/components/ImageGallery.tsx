/**
 * ImageGallery component for displaying images in chat messages
 */

import { useState, useEffect, useMemo } from "react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { ZoomInIcon } from "@radix-ui/react-icons";
import { Image } from "@workspace/react";
import type { Attachment } from "@workspace/pubsub";
import {
  createImagePreviewUrl, revokeImagePreviewUrl, isImageMimeType,
} from "../utils/imageUtils";

interface ImageGalleryProps {
  attachments: Attachment[];
  /** Maximum number of images to show in collapsed view */
  maxVisible?: number;
}

interface ImagePreview {
  url: string;
  attachment: Attachment;
}

export function ImageGallery({ attachments, maxVisible = 4 }: ImageGalleryProps) {
  const [showAll, setShowAll] = useState(false);
  const [previews, setPreviews] = useState<ImagePreview[]>([]);
  const imageAttachments = useMemo(
    () => attachments.filter((a) => isImageMimeType(a.mimeType)),
    [attachments]
  );

  useEffect(() => {
    const next = imageAttachments.map((attachment) => ({
      url: createImagePreviewUrl(attachment.data, attachment.mimeType),
      attachment,
    }));
    setPreviews(next);
    return () => next.forEach((preview) => revokeImagePreviewUrl(preview.url));
  }, [imageAttachments]);

  if (!imageAttachments.length) return null;
  return (
      <Flex gap="2" wrap="wrap" mt="2">
      {(showAll ? previews : previews.slice(0, maxVisible)).map((preview) => (
          <Image
          key={preview.attachment.id}
          src={preview.url}
              alt={preview.attachment.name ?? "Attached image"}
          filename={preview.attachment.name}
        />
        ))}
      {!showAll && previews.length > maxVisible ? (
          <Button size="1" variant="soft" onClick={() => setShowAll(true)}
          >
          Show {previews.length - maxVisible} more images
        </Button>
      ) : null}
    </Flex>
  );
}

/**
 * Compact image indicator for inline display
 */
interface ImageIndicatorProps {
  count: number;
  onClick?: () => void;
}

export function ImageIndicator({ count, onClick }: ImageIndicatorProps) {
  if (count === 0) return null;

  return (
    <Flex
      gap="1"
      align="center"
      px="2"
      py="1"
      tabIndex={0}
      style={{ background: "var(--gray-3)", borderRadius: "var(--radius-2)", cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
    >
      <ZoomInIcon width={12} height={12} />
      <Text size="1" color="gray">
        {count} image{count > 1 ? "s" : ""}
      </Text>
    </Flex>
  );
}
