import { useEffect, useRef, useState } from "react";
import { Dialog, Flex, IconButton } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { images } from "@workspace/runtime";
import type { ImageAsset } from "@workspace/runtime/images";
import { useGeneratedImage } from "./GeneratedImage.js";

/** Media sources are browser URLs, never server-local filesystem paths. */
export function mediaUrl(source: string): string {
  if (!source || source.startsWith("//"))
    throw new Error("A media URL is required");
  const page =
    typeof location !== "undefined" && /^https?:$/.test(location.protocol)
      ? location.href
      : "https://workspace.invalid/";
  const url = new URL(source, page);
  const bundledMedia =
    url.protocol === "data:" &&
    /^data:(?:image\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/vtt)(?:;[^,]*)?,/i.test(
      source,
    );
  const sameOrigin =
    url.protocol === "http:" && url.origin === new URL(page).origin;
  if (
    url.username ||
    url.password ||
    (!bundledMedia &&
      !sameOrigin &&
      !["https:", "blob:"].includes(url.protocol))
  )
    throw new Error(
      "Media requires HTTPS, a panel-relative URL, or a bundled media URL",
    );
  return source;
}
export function youtubeSource(
  source: string,
): { id: string; start: number } | null {
  const url = new URL(mediaUrl(source), "https://workspace.invalid/");
  const host = url.hostname.toLowerCase();
  if (
    ![
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ].includes(host)
  )
    return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id =
    host === "youtu.be"
      ? parts[0]
      : parts[0] === "watch"
        ? url.searchParams.get("v")
        : ["embed", "shorts", "live"].includes(parts[0] ?? "")
          ? parts[1]
          : undefined;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new Error("Invalid YouTube video URL");
  const time =
    url.searchParams.get("start") ?? url.searchParams.get("t") ?? "0";
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);
  const start = /^\d+$/.test(time)
    ? Number(time)
    : match
      ? Number(match[1] ?? 0) * 3600 +
        Number(match[2] ?? 0) * 60 +
        Number(match[3] ?? 0)
      : 0;
  return { id, start: Number.isSafeInteger(start) ? start : 0 };
}
export interface VideoProps {
  url: string;
  title: string;
  poster?: string;
  caption?: string;
  /** WebVTT captions for an owned video. YouTube owns its player captions. */
  captionsUrl?: string;
  captionsLanguage?: string;
}
export function Video(props: VideoProps) {
  // Source identity owns playback state: changing a URL retires the old player.
  return <VideoSource key={props.url} {...props} />;
}
function VideoSource({
  url,
  title,
  poster,
  caption,
  captionsUrl,
  captionsLanguage = "en",
}: VideoProps) {
  const [error, setError] = useState<string>();
  const captionsRef = useRef<HTMLTrackElement>(null);
  useEffect(() => {
    const track = captionsRef.current;
    if (!track) return;
    // Track errors do not bubble and React does not install a direct listener
    // for this element. The track owns its native listener through unmount.
    const onError = () => setError("Captions could not be loaded.");
    track.addEventListener("error", onError);
    return () => track.removeEventListener("error", onError);
  }, [captionsUrl]);
  let youtube: ReturnType<typeof youtubeSource>;
  try {
    youtube = youtubeSource(url);
    if (poster) mediaUrl(poster);
    if (captionsUrl) mediaUrl(captionsUrl);
  } catch (cause) {
    return (
      <span role="alert">
        {cause instanceof Error ? cause.message : String(cause)}
      </span>
    );
  }
  const watchUrl = youtube
    ? `https://www.youtube.com/watch?v=${youtube.id}${youtube.start ? `&t=${youtube.start}` : ""}`
    : url;
  return (
    <figure style={{ margin: "12px 0", maxWidth: "100%" }}>
      {youtube ? (
        <iframe
          title={title}
          src={`https://www.youtube-nocookie.com/embed/${youtube.id}?start=${youtube.start}`}
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{
            display: "block",
            width: "100%",
            minHeight: 200,
            aspectRatio: "16 / 9",
            border: 0,
            borderRadius: 8,
          }}
          onError={() => setError("The YouTube player could not be loaded.")}
        />
      ) : (
        <video
          controls
          playsInline
          preload="metadata"
          crossOrigin={captionsUrl ? "anonymous" : undefined}
          src={url}
          poster={poster}
          aria-label={title}
          style={{
            display: "block",
            width: "100%",
            maxHeight: 480,
            borderRadius: 8,
          }}
          onError={() => setError("This video could not be played.")}
        >
          {captionsUrl ? (
            <track
              ref={captionsRef}
              kind="captions"
              src={captionsUrl}
              srcLang={captionsLanguage}
              label={captionsLanguage}
              default
            />
          ) : null}
        </video>
      )}
      <figcaption style={{ fontSize: "0.875em", marginTop: 8 }}>
        {caption ?? title} ·{" "}
        <a href={watchUrl}>{youtube ? "Watch on YouTube" : "Open video"}</a>
        {error ? (
          <span role="alert" style={{ display: "block" }}>
            {error}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
export interface ImageProps {
  src?: string;
  assetId?: string;
  alt: string;
  caption?: string;
  filename?: string;
}
export function Image(props: ImageProps) {
  return <ImageSource key={props.assetId ?? props.src} {...props} />;
}
function ImageSource({ src, assetId, alt, caption, filename }: ImageProps) {
  const [asset, setAsset] = useState<ImageAsset>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const loaded = useGeneratedImage(asset);
  useEffect(() => {
    if (!assetId) return;
    let active = true;
    void images.getAsset(assetId).then(
      (value) => {
        if (active) setAsset(value);
      },
      (cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [assetId]);
  let url: string | undefined;
  try {
    if (Boolean(src) === Boolean(assetId))
      throw new Error("Image requires exactly one of src or assetId");
    url = src ? mediaUrl(src) : loaded.url;
  } catch (cause) {
    return (
      <span role="alert">
        {cause instanceof Error ? cause.message : String(cause)}
      </span>
    );
  }
  const failure = error ?? loaded.error?.message;
  if (failure)
    return <span role="alert">Image could not be loaded: {failure}</span>;
  if (!url) return <span role="status">Loading image…</span>;
  const title = caption || alt || filename || "Image";
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          maxWidth: "100%",
          verticalAlign: "top",
        }}
      >
        <Dialog.Trigger>
          <button
            type="button"
            aria-label={`Enlarge ${alt || "image"}`}
            style={{
              padding: 0,
              border: 0,
              background: "transparent",
              cursor: "zoom-in",
              maxWidth: "100%",
            }}
          >
            <img
              src={url}
              alt={alt}
              loading="lazy"
              onError={() => setError("Image source is unavailable")}
              width={asset?.width}
              height={asset?.height}
              style={{
                display: "block",
                width: "auto",
                height: "auto",
                maxWidth: "100%",
                maxHeight: 360,
                objectFit: "contain",
                borderRadius: 8,
              }}
            />
          </button>
        </Dialog.Trigger>
        {caption ? (
          <span style={{ fontSize: "0.875em", marginTop: 6 }}>{caption}</span>
        ) : null}
        <Dialog.Content
          maxWidth="90vw"
          style={{ maxHeight: "90dvh", overflow: "auto" }}
        >
          <Flex justify="between" align="center" gap="3">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close>
              <IconButton aria-label="Close image" variant="ghost">
                <Cross2Icon />
              </IconButton>
            </Dialog.Close>
          </Flex>
          <img
            src={url}
            alt={alt}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "70dvh",
              objectFit: "contain",
              margin: "auto",
            }}
          />
          <a
            href={url}
            download={
              filename ??
              (asset ? `image.${asset.mimeType.split("/")[1]}` : undefined)
            }
          >
            {assetId || src?.startsWith("blob:") || src?.startsWith("data:")
              ? "Download image"
              : "Open original image"}
          </a>
        </Dialog.Content>
      </span>
    </Dialog.Root>
  );
}
