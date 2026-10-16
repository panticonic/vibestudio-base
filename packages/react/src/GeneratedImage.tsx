import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import type { ImageAsset } from "@workspace/runtime/images";
import type { LoadedImage } from "@workspace/runtime/image-loader";
import { NO_IMAGES_PORT, imageLoaderFor, useImagesPort } from "./imagesPort.js";

export function useGeneratedImage(asset: ImageAsset | null | undefined) {
  const port = useImagesPort();
  const loader = port ? imageLoaderFor(port) : null;
  const [state, setState] = useState<{ id: string; loaded?: LoadedImage; error?: Error } | null>(
    null
  );
  useEffect(() => {
    setState(asset ? { id: asset.id } : null);
    if (!asset) return;
    if (!loader) {
      setState({ id: asset.id, error: new Error(NO_IMAGES_PORT) });
      return;
    }
    const controller = new AbortController();
    let loaded: LoadedImage | undefined;
    void loader.load(asset, { signal: controller.signal }).then(
      (value) => {
        if (controller.signal.aborted) {
          value.release();
          return;
        }
        loaded = value;
        setState({ id: asset.id, loaded: value });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            id: asset.id,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      }
    );
    return () => {
      controller.abort();
      loaded?.release();
    };
  }, [asset?.id, loader]);
  const current = state?.id === asset?.id ? state : null;
  return {
    url: current?.loaded?.url,
    image: current?.loaded?.image,
    error: current?.error,
    loading: !!asset && !current?.loaded && !current?.error,
  };
}
export interface GeneratedImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet"
> {
  asset: ImageAsset | null | undefined;
  alt: string;
  loadingFallback?: ReactNode;
  errorFallback?: (error: Error) => ReactNode;
}
/** Asset changes immediately hide the old image; late results never replace it. */
export function GeneratedImage({
  asset,
  loadingFallback,
  errorFallback,
  alt,
  ...props
}: GeneratedImageProps) {
  const { url, loading, error } = useGeneratedImage(asset);
  if (error) return errorFallback?.(error) ?? <span role="alert">Image could not be loaded.</span>;
  if (loading) return loadingFallback ?? <span role="status">Loading image…</span>;
  if (!url) return null;
  return <img {...props} src={url} alt={alt} />;
}
