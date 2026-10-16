/**
 * Media and places under the browser's names. A terminal cannot show a
 * picture, a video or a map, so each is one line naming it and linking to
 * where it can be seen (OSC 8, which terminals open on click).
 */
import React from "react";
import { Box, Text as InkText } from "ink";
import { CodeBlock, Link } from "./text.js";
import { list, number, record, text } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };

function mediaLine(label: string, href: string | undefined): React.ReactElement {
  // A data: URL is the picture itself, not somewhere to go.
  const target = href && !href.startsWith("data:") ? href : undefined;
  return (
    <InkText>
      <InkText dimColor>▣ </InkText>
      <Link href={target}>{label}</Link>
    </InkText>
  );
}

export function Image(props: Loose): React.ReactElement {
  const label = text(props["caption"]) ?? text(props["alt"]) ?? text(props["filename"]) ?? "Image";
  return mediaLine(label, text(props["src"]));
}

export function GeneratedImage(props: Loose): React.ReactElement {
  const asset = record(props["asset"]);
  return mediaLine(text(props["alt"]) ?? "Generated image", text(asset?.["url"]));
}

const YOUTUBE_HOSTS = /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)$/;

/** A YouTube player address as the page people can watch it on; other addresses as given. */
export function watchUrl(source: string): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const id =
    url.hostname === "youtu.be"
      ? parts[0]
      : YOUTUBE_HOSTS.test(url.hostname)
        ? parts[0] === "watch"
          ? url.searchParams.get("v")
          : ["embed", "shorts", "live"].includes(parts[0] ?? "")
            ? parts[1]
            : undefined
        : undefined;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return source;
  const start = url.searchParams.get("start") ?? url.searchParams.get("t");
  return `https://www.youtube.com/watch?v=${id}${start && /^\d+$/.test(start) ? `&t=${start}` : ""}`;
}

export function Video(props: Loose): React.ReactElement {
  const source = text(props["url"]) ?? text(props["src"]);
  const label = text(props["title"]) ?? text(props["caption"]) ?? "Video";
  return mediaLine(label, source ? watchUrl(source) : undefined);
}

// ── places ──────────────────────────────────────────────────────────────────

function mapUrl(place: Record<string, unknown>): string | undefined {
  const lat = number(place["lat"] ?? place["latitude"]);
  const lng = number(place["lng"] ?? place["lon"] ?? place["long"] ?? place["longitude"]);
  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const la = Number(lat.toFixed(6));
    const ln = Number(lng.toFixed(6));
    return `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=16/${la}/${ln}`;
  }
  const query = text(place["address"]) ?? text(place["name"]);
  return query
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`
    : undefined;
}

/** Places as a list, each linking to a map of it. */
export function PlaceMap(props: Loose): React.ReactElement {
  const places = list(props["places"]).flatMap((raw) => (record(raw) ? [record(raw)!] : []));
  const route = props["route"] === true || props["route"] === "true";
  return (
    <Box flexDirection="column">
      {text(props["title"]) ? <InkText bold>{text(props["title"])}</InkText> : null}
      {places.length === 0 ? <InkText color="red">PlaceMap needs a `places` list.</InkText> : null}
      {places.map((place, index) => {
        const name = text(place["name"]) ?? text(place["title"]) ?? `Place ${index + 1}`;
        const where = text(place["address"]);
        const detail = text(place["detail"]) ?? text(place["description"]);
        return (
          <Box key={index} flexDirection="column">
            <InkText>
              <InkText dimColor>{route ? `${index + 1}. ` : "◉ "}</InkText>
              <Link href={mapUrl(place)}>{name}</Link>
              {where ? <InkText dimColor>{`  ${where}`}</InkText> : null}
            </InkText>
            {detail ? <InkText dimColor>{`  ${detail}`}</InkText> : null}
          </Box>
        );
      })}
    </Box>
  );
}

// ── diagrams ────────────────────────────────────────────────────────────────

/** A diagram's source (`code`, or the text inside), captioned as one. */
export function Diagram(props: Loose): React.ReactElement {
  const source =
    text(props["code"]) ??
    React.Children.toArray(props.children)
      .filter((child) => typeof child === "string" || typeof child === "number")
      .join("");
  return <CodeBlock caption="diagram">{source.replace(/\n$/, "")}</CodeBlock>;
}
