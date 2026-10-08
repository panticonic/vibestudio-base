import { useState } from "react";
import { Link, Text } from "@radix-ui/themes";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { fitBounds, openStreetMapUrl, tileUrl, toScreen, visibleTiles, type LatLng } from "./mapMath";
import {
  ProblemNotice,
  ResponseFrame,
  clampNumber,
  isRecord,
  toBoolean,
  toList,
  toNumber,
  toText,
  useElementWidth,
} from "./shared";

export interface MapPlace {
  /** Place name. */
  name: string;
  /** Latitude in degrees (-90..90). */
  lat: number;
  /** Longitude in degrees (-180..180). */
  lng: number;
  /** Emoji drawn as the pin, e.g. "🍜". */
  emoji?: string;
  /** Short note shown in the list and when selected. */
  detail?: string;
}

export interface PlaceMapProps {
  /** Places to pin. `latitude`/`longitude`/`lon` are accepted too. */
  places: MapPlace[];
  /** Draw a line through the places in order and number the pins. */
  route?: boolean;
  /** Optional heading. */
  title?: string;
  /** Map height in pixels (160–480). Default 260. */
  height?: number;
}

interface Place extends LatLng {
  name: string;
  emoji?: string;
  detail?: string;
}

/** Turn loose model input into valid places, collecting problems. */
export function normalizePlaces(input: unknown): { places: Place[]; problems: string[] } {
  const list = toList(input);
  if (!list) return { places: [], problems: ["`places` must be an array of { name, lat, lng }."] };
  const places: Place[] = [];
  const invalid: string[] = [];
  list.forEach((raw, index) => {
    if (!isRecord<keyof MapPlace | "title" | "description" | "latitude" | "lon" | "long" | "longitude">(raw)) {
      invalid.push(`#${index + 1}`);
      return;
    }
    const name = toText(raw.name) ?? toText(raw.title) ?? `Place ${index + 1}`;
    const lat = toNumber(raw.lat ?? raw.latitude);
    const lng = toNumber(raw.lng ?? raw.lon ?? raw.long ?? raw.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      invalid.push(name);
      return;
    }
    places.push({ name, lat, lng, emoji: toText(raw.emoji), detail: toText(raw.detail) ?? toText(raw.description) });
  });
  const problems = invalid.length
    ? [`Missing or invalid coordinates for ${invalid.join(", ")}; not shown.`]
    : [];
  return { places, problems };
}

/**
 * An OpenStreetMap map with pins, an optional route, and a place list. Pins
 * and list entries are linked: select either to highlight the place.
 */
export function PlaceMap({ places, route, title, height }: PlaceMapProps) {
  const normalized = normalizePlaces(places);
  const mapHeight = clampNumber(height, 160, 480, 260);
  const [ref, width] = useElementWidth<HTMLDivElement>(320);
  const [selected, setSelected] = useState<number | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const isRoute = toBoolean(route) && normalized.places.length > 1;

  if (normalized.places.length === 0) {
    return (
      <ResponseFrame title={title} label="Map">
        <ProblemNotice component="PlaceMap" title="Map" problems={normalized.problems.length ? normalized.problems : ["There are no places to show."]} />
      </ResponseFrame>
    );
  }

  const view = fitBounds(normalized.places, width, mapHeight, { padding: 36, maxZoom: normalized.places.length === 1 ? 14 : 16 });
  const tiles = tilesFailed ? [] : visibleTiles(view, width, mapHeight);
  const points = normalized.places.map((place) => toScreen(place, view, width, mapHeight));
  const pinLabel = (index: number) => (isRoute ? String(index + 1) : normalized.places[index]!.emoji);

  return (
    <ResponseFrame title={title} label="Map" className="vs-r-map">
      <div
        ref={ref}
        className="vs-r-map-canvas"
        data-tiles-failed={tilesFailed || undefined}
        style={{ height: mapHeight }}
      >
        <div className="vs-r-map-tiles" aria-hidden>
          {tiles.map((tile) => (
            <img
              key={`${tile.z}/${tile.left}/${tile.top}`}
              src={tileUrl(tile)}
              alt=""
              width={256}
              height={256}
              draggable={false}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ left: tile.left, top: tile.top }}
              onError={() => setTilesFailed(true)}
            />
          ))}
        </div>
        <svg className="vs-r-map-overlay" width={width} height={mapHeight} aria-hidden>
          {isRoute ? (
            <polyline
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="var(--accent-9)"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeOpacity={0.85}
            />
          ) : null}
        </svg>
        {normalized.places.map((place, index) => {
          const point = points[index]!;
          const active = selected === index;
          const glyph = pinLabel(index);
          return (
            <button
              key={index}
              type="button"
              className="vs-r-map-pin"
              data-active={active || undefined}
              data-glyph={glyph ? "custom" : undefined}
              style={{ left: point.x, top: point.y, zIndex: active ? 3 : 2 }}
              aria-label={`${isRoute ? `Stop ${index + 1}` : "Pin"}: ${place.name}`}
              aria-pressed={active}
              onClick={() => setSelected(active ? null : index)}
            >
              <span aria-hidden>{glyph ?? ""}</span>
            </button>
          );
        })}
        {selected !== null ? (
          <div
            className="vs-r-map-callout"
            style={{
              left: Math.min(Math.max(points[selected]!.x, 70), width - 70),
              top: points[selected]!.y,
            }}
            role="status"
          >
            <Text size="1" weight="bold">
              {normalized.places[selected]!.name}
            </Text>
          </div>
        ) : null}
        {tilesFailed ? (
          <Text size="1" color="gray" className="vs-r-map-offline">
            Map tiles unavailable
          </Text>
        ) : null}
        <a
          className="vs-r-map-attribution"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </div>
      <ol className="vs-r-map-list" data-route={isRoute || undefined}>
        {normalized.places.map((place, index) => (
          <li key={index} data-active={selected === index || undefined}>
            <button
              type="button"
              className="vs-r-map-list-button"
              aria-pressed={selected === index}
              onClick={() => setSelected(selected === index ? null : index)}
            >
              <span className="vs-r-map-list-marker" aria-hidden>
                {isRoute ? index + 1 : (place.emoji ?? "•")}
              </span>
              <span className="vs-r-map-list-text">
                <Text as="span" size="2" weight="medium">
                  {place.name}
                </Text>
                {place.detail ? (
                  <Text as="span" size="1" color="gray">
                    {place.detail}
                  </Text>
                ) : null}
              </span>
            </button>
            <Link
              size="1"
              href={openStreetMapUrl(place)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${place.name} in OpenStreetMap`}
              className="vs-r-map-open"
            >
              <ExternalLinkIcon aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
      <ProblemNotice component="PlaceMap" title="Map" problems={normalized.problems} />
    </ResponseFrame>
  );
}
