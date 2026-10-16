import { createContext, createElement, useContext, type ReactNode } from "react";
import type { ImageAsset, ImagesClient } from "@workspace/runtime/images";
import { createImageLoader, type ImageLoader } from "@workspace/runtime/image-loader";

/**
 * How `Image` and `GeneratedImage` read workspace image assets. The host that
 * mounts the UI supplies it: the panel mount provides the runtime `images`
 * client; a chat surface provides its `ChatHostPorts.images`. There is no
 * ambient fallback, so a page without a provider fails loudly.
 */
export type ImagesPort = Pick<ImagesClient, "getAsset" | "getBytes">;

const ImagesPortContext = createContext<ImagesPort | null>(null);

export function ImagesPortProvider({
  images,
  children,
}: {
  images: ImagesPort | undefined;
  children?: ReactNode;
}) {
  return createElement(ImagesPortContext.Provider, { value: images ?? null }, children);
}

/** The host's images port, or null where it provides none (assets then fail with `NO_IMAGES_PORT`). */
export function useImagesPort(): ImagesPort | null {
  return useContext(ImagesPortContext);
}

export const NO_IMAGES_PORT = "Image assets are not available: this host provides no images port";

const loaders = new WeakMap<ImagesPort, ImageLoader>();
/** One loader per port, so object-URL leases are shared by every consumer. */
export function imageLoaderFor(port: ImagesPort): ImageLoader {
  let loader = loaders.get(port);
  if (!loader) {
    loader = createImageLoader(port);
    loaders.set(port, loader);
  }
  return loader;
}

export type { ImageAsset };
