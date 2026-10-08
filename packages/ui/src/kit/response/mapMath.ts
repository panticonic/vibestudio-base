/** Web-Mercator projection, bounds fitting, and tile coverage for `Map` (no DOM). */

export const TILE_SIZE = 256;
export const MAX_LATITUDE = 85.05112878;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

/** World pixel coordinates of a location at `zoom` (Web Mercator, 256px tiles). */
export function project({ lat, lng }: LatLng, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Inverse of `project`. */
export function unproject({ x, y }: Point, zoom: number): LatLng {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    lng: (x / scale) * 360 - 180,
  };
}

export interface MapView {
  zoom: number;
  /** World pixel at the viewport's center, at `zoom`. */
  center: Point;
}

export interface FitOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * The highest integer zoom at which every point fits inside the viewport
 * minus padding, centered on the points' bounding box. A single point uses
 * `maxZoom`.
 */
export function fitBounds(
  points: LatLng[],
  width: number,
  height: number,
  { padding = 32, minZoom = 1, maxZoom = 15 }: FitOptions = {},
): MapView {
  if (points.length === 0) return { zoom: minZoom, center: project({ lat: 0, lng: 0 }, minZoom) };
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  for (let zoom = maxZoom; zoom >= minZoom; zoom--) {
    const projected = points.map((point) => project(point, zoom));
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if ((maxX - minX <= innerW && maxY - minY <= innerH) || zoom === minZoom) {
      return { zoom, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } };
    }
  }
  return { zoom: minZoom, center: project(points[0]!, minZoom) };
}

/** Screen position of a location within a viewport showing `view`. */
export function toScreen(point: LatLng, view: MapView, width: number, height: number): Point {
  const world = project(point, view.zoom);
  return { x: world.x - view.center.x + width / 2, y: world.y - view.center.y + height / 2 };
}

export interface Tile {
  /** Tile column/row as fetched (column wrapped around the antimeridian). */
  x: number;
  y: number;
  z: number;
  /** Screen offset of the tile's top-left corner. */
  left: number;
  top: number;
}

/** Tiles covering the viewport. Rows outside the world are skipped; columns wrap. */
export function visibleTiles(view: MapView, width: number, height: number): Tile[] {
  const originX = view.center.x - width / 2;
  const originY = view.center.y - height / 2;
  const count = 2 ** view.zoom;
  const tiles: Tile[] = [];
  for (let ty = Math.floor(originY / TILE_SIZE); ty * TILE_SIZE < originY + height; ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(originX / TILE_SIZE); tx * TILE_SIZE < originX + width; tx++) {
      tiles.push({
        x: ((tx % count) + count) % count,
        y: ty,
        z: view.zoom,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }
  return tiles;
}

export function tileUrl(tile: Pick<Tile, "x" | "y" | "z">): string {
  return `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
}

/** An openstreetmap.org link that drops a marker at the location. */
export function openStreetMapUrl({ lat, lng }: LatLng, zoom = 16): string {
  const la = Number(lat.toFixed(6));
  const ln = Number(lng.toFixed(6));
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=${zoom}/${la}/${ln}`;
}
