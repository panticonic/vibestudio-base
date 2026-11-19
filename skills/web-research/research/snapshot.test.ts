import { afterEach, describe, expect, it, vi } from "vitest";

const root = vi.hoisted(() => vi.fn());
vi.mock("./researchBrief.nl", () => ({ default: root }));
import { brief } from "./natlang.js";

afterEach(() => {
  vi.useRealTimers();
  root.mockReset();
});

describe("research invocation snapshot", () => {
  it("replays the saved read date through the natural-language root on a later day", async () => {
    const saved = Date.parse("2026-11-17T00:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const result = { status: "insufficient", statements: [], notRead: [], rejected: 0 };
    root.mockResolvedValue(result);
    expect(await brief("What changed?", ["https://example.test/record"], saved)).toBe(result);
    expect(root).toHaveBeenCalledWith("What changed?", ["https://example.test/record"], saved);
  });

  it("captures the default timestamp before asynchronous root execution crosses midnight", async () => {
    vi.useFakeTimers();
    const started = Date.parse("2026-11-17T23:59:59Z");
    vi.setSystemTime(started);
    root.mockImplementation(async () => {
      vi.setSystemTime(started + 2000);
      return "completed";
    });
    await brief("What changed?", []);
    expect(root).toHaveBeenCalledWith("What changed?", [], started);
  });
});
