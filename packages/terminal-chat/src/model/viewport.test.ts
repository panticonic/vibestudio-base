import { describe, expect, it } from "vitest";
import { FOLLOW, computeWindow, revealRow, rowSource, scrollBy } from "./viewport.js";

const rows = (...heights: number[]) =>
  rowSource(
    heights.map((h, i) => ({ id: `r${i}`, lines: Array.from({ length: h }, (_, j) => `r${i}.${j}`) })),
    (row) => row.id,
    (row) => row.lines
  );
const texts = (w: ReturnType<typeof computeWindow>) => w.lines.map((l) => l.text);

describe("transcript viewport", () => {
  it("follows the newest lines", () => {
    const source = rows(2, 3, 2);
    expect(texts(computeWindow(source, 4, FOLLOW))).toEqual(["r1.1", "r1.2", "r2.0", "r2.1"]);
  });

  it("only lays out the rows it shows", () => {
    let laidOut = 0;
    const source = rowSource(
      Array.from({ length: 1000 }, (_, i) => i),
      (i) => String(i),
      () => {
        laidOut++;
        return ["line"];
      }
    );
    computeWindow(source, 10, FOLLOW);
    expect(laidOut).toBeLessThan(25);
  });

  it("scrolls by lines across rows and returns to follow at the bottom", () => {
    const source = rows(3, 3, 3);
    const up = scrollBy(source, 3, FOLLOW, -4);
    expect(up).toEqual({ mode: "anchored", id: "r0", line: 2 });
    expect(texts(computeWindow(source, 3, up))).toEqual(["r0.2", "r1.0", "r1.1"]);
    expect(scrollBy(source, 3, up, 10)).toEqual(FOLLOW);
    expect(computeWindow(source, 3, scrollBy(source, 3, FOLLOW, -100)).atTop).toBe(true);
  });

  it("keeps an anchored view stable when rows arrive below", () => {
    const anchored = { mode: "anchored" as const, id: "r0", line: 1 };
    expect(texts(computeWindow(rows(3, 3, 3, 3), 2, anchored))).toEqual(texts(computeWindow(rows(3, 3, 3), 2, anchored)));
  });

  it("reveals a selected row above or below the viewport", () => {
    const source = rows(2, 2, 2, 2);
    const top = revealRow(source, 3, FOLLOW, 0);
    expect(texts(computeWindow(source, 3, top))[0]).toBe("r0.0");
    const back = revealRow(source, 3, top, 3);
    expect(texts(computeWindow(source, 3, back)).at(-1)).toBe("r3.1");
  });
});
