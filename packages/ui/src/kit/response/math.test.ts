import { describe, expect, it } from "vitest";
import { arcPath, labelStride, linearScale, niceNumber, niceScale, stackSeries } from "./chartMath";
import { fitBounds, openStreetMapUrl, project, tileUrl, toScreen, unproject, visibleTiles } from "./mapMath";
import { formatNumber, toList, toNumber } from "./shared";

describe("chart scale math", () => {
  it("rounds ranges to 1/2/5 steps", () => {
    expect(niceNumber(0.7, true)).toBe(1);
    expect(niceNumber(23, true)).toBe(20);
    expect(niceNumber(42, true)).toBe(50);
    expect(niceNumber(830, false)).toBe(1000);
  });

  it("covers the data with round ticks", () => {
    expect(niceScale(0, 97, 5)).toEqual({ min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] });
    const negative = niceScale(-13, 42, 5);
    expect(negative.min).toBeLessThanOrEqual(-13);
    expect(negative.max).toBeGreaterThanOrEqual(42);
    expect(negative.ticks).toContain(0);
  });

  it("produces clean decimal ticks without float noise", () => {
    expect(niceScale(0, 0.7, 5).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(niceScale(0, 0.03, 4).ticks).toEqual([0, 0.02, 0.04]);
  });

  it("widens degenerate and invalid domains", () => {
    expect(niceScale(5, 5).min).toBe(0);
    expect(niceScale(0, 0).max).toBeGreaterThan(0);
    expect(niceScale(-4, -4).max).toBe(0);
    expect(niceScale(Number.NaN, Number.POSITIVE_INFINITY).ticks.length).toBeGreaterThan(1);
  });

  it("maps a domain onto pixels (inverted y)", () => {
    const y = linearScale(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });

  it("stacks positive and negative values separately and skips gaps", () => {
    const stacks = stackSeries([
      [10, -5, null],
      [20, -5, 3],
    ]);
    expect(stacks[1]![0]).toEqual({ start: 10, end: 30 });
    expect(stacks[1]![1]).toEqual({ start: -5, end: -10 });
    expect(stacks[0]![2]).toEqual({ start: 0, end: 0 });
    expect(stacks[1]![2]).toEqual({ start: 0, end: 3 });
  });

  it("draws full rings as two arcs and partial slices as one", () => {
    expect(arcPath(50, 50, 40, 0, 0, Math.PI * 2).match(/A /g)).toHaveLength(2);
    expect(arcPath(50, 50, 40, 20, 0, Math.PI * 2).match(/A /g)).toHaveLength(4);
    expect(arcPath(50, 50, 40, 0, 0, Math.PI / 2)).toMatch(/^M 50 50 L 50\.000 10\.000 A 40 40 0 0 1 90\.000 50\.000 Z$/);
  });

  it("thins category labels to fit", () => {
    expect(labelStride(6, 300)).toBe(1);
    expect(labelStride(30, 288)).toBe(5);
  });
});

describe("map projection math", () => {
  it("projects and unprojects Web-Mercator coordinates", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const world = project({ lat: 48.8584, lng: 2.2945 }, 12);
    const back = unproject(world, 12);
    expect(back.lat).toBeCloseTo(48.8584, 6);
    expect(back.lng).toBeCloseTo(2.2945, 6);
    // Latitudes beyond the Mercator limit clamp instead of producing Infinity.
    expect(Number.isFinite(project({ lat: 90, lng: 0 }, 3).y)).toBe(true);
  });

  it("fits bounds at the highest zoom that contains every point", () => {
    const places = [
      { lat: 48.8584, lng: 2.2945 },
      { lat: 48.8606, lng: 2.3376 },
      { lat: 48.853, lng: 2.3499 },
    ];
    const view = fitBounds(places, 320, 260, { padding: 30 });
    const screens = places.map((place) => toScreen(place, view, 320, 260));
    for (const point of screens) {
      expect(point.x).toBeGreaterThanOrEqual(30);
      expect(point.x).toBeLessThanOrEqual(290);
      expect(point.y).toBeGreaterThanOrEqual(30);
      expect(point.y).toBeLessThanOrEqual(230);
    }
    // One more zoom level would no longer fit.
    const tighter = fitBounds(places, 320, 260, { padding: 30, maxZoom: view.zoom + 1, minZoom: view.zoom + 1 });
    const spread = places.map((place) => toScreen(place, tighter, 320, 260));
    const width = Math.max(...spread.map((p) => p.x)) - Math.min(...spread.map((p) => p.x));
    const height = Math.max(...spread.map((p) => p.y)) - Math.min(...spread.map((p) => p.y));
    expect(width > 260 || height > 200).toBe(true);
  });

  it("uses maxZoom for a single point and centers it", () => {
    const view = fitBounds([{ lat: 35.6762, lng: 139.6503 }], 320, 260, { maxZoom: 14 });
    expect(view.zoom).toBe(14);
    expect(toScreen({ lat: 35.6762, lng: 139.6503 }, view, 320, 260)).toEqual({ x: 160, y: 130 });
  });

  it("covers the viewport with tiles, wrapping columns and skipping rows outside the world", () => {
    const view = { zoom: 1, center: { x: 0, y: 256 } };
    const tiles = visibleTiles(view, 512, 512);
    expect(tiles.every((tile) => tile.x >= 0 && tile.x < 2)).toBe(true);
    expect(tiles.every((tile) => tile.y >= 0 && tile.y < 2)).toBe(true);
    expect(tiles).toHaveLength(4);
    expect(tileUrl({ z: 3, x: 4, y: 2 })).toBe("https://tile.openstreetmap.org/3/4/2.png");
  });

  it("links places to openstreetmap.org", () => {
    expect(openStreetMapUrl({ lat: 51.5007, lng: -0.1246 })).toBe(
      "https://www.openstreetmap.org/?mlat=51.5007&mlon=-0.1246#map=16/51.5007/-0.1246",
    );
  });
});

describe("input coercion", () => {
  it("reads numbers from sloppy strings", () => {
    expect(toNumber("1,234.5")).toBe(1234.5);
    expect(toNumber(" $12 ")).toBe(12);
    expect(toNumber("45%")).toBe(45);
    expect(toNumber("+3")).toBe(3);
    expect(toNumber("−7")).toBe(-7);
    expect(toNumber("abc")).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber(true)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
  });

  it("parses JSON array text and wraps single objects", () => {
    expect(toList('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(toList({ a: 1 })).toEqual([{ a: 1 }]);
    expect(toList("not json")).toBeNull();
  });

  it("formats numbers, percents, currency, and units", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatNumber(25, { format: "percent" })).toBe("25%");
    expect(formatNumber(1299, { format: "currency", currency: "usd" })).toBe("$1,299");
    expect(formatNumber(12.5, { format: "currency" })).toBe("$12.50");
    expect(formatNumber(3, { format: "currency", currency: "NOPE" })).toBe("3 NOPE");
    expect(formatNumber(12, { unit: "km" })).toBe("12 km");
    expect(formatNumber(21, { unit: "°C" })).toBe("21°C");
    expect(formatNumber(1_500_000, {}, true)).toBe("1.5M");
  });
});
