// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getMdxParser } from "./messageMdx";
import { RichMessageContent } from "./RichMessageContent.js";
import { installPanelModules, warmMessageMdx } from "./panelModules.testing";

beforeAll(async () => {
  await warmMessageMdx();
  await getMdxParser();
});
let restorePanelModules: () => void;
beforeEach(() => {
  restorePanelModules = installPanelModules();
});
afterEach(() => restorePanelModules());

function target() {
  const publish = vi.fn(async () => undefined);
  return {
    publish,
    feedback: {
      chat: { publish },
      author: { kind: "agent", id: "agent:author" },
      messageId: "m1",
    },
  };
}

const callout = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".rt-CalloutRoot");

describe("RichMessageContent while streaming", () => {
  it("renders completed blocks as MDX while the remainder streams, then the whole message", async () => {
    const { publish, feedback } = target();
    const head = "Intro.\n\n<Callout>Finished callout</Callout>\n\n";
    const view = render(
      <RichMessageContent content={`${head}Still typ`} isStreaming feedback={feedback} />,
    );
    await waitFor(() => expect(callout(view.container)?.textContent).toBe("Finished callout"));
    expect(view.container.textContent).toContain("Still typ");
    expect(view.container.querySelector("[data-ui-render]")).toBeNull();
    const first = callout(view.container)!;

    // A later block completes: the longer prefix recompiles, and the block
    // already rendered keeps its DOM rather than remounting.
    const grown = `${head}Still typing.\n\n<Callout>Second</Callout>\n\nMore`;
    view.rerender(<RichMessageContent content={grown} isStreaming feedback={feedback} />);
    await waitFor(() =>
      expect(view.container.querySelectorAll(".rt-CalloutRoot")).toHaveLength(2),
    );
    expect(callout(view.container)).toBe(first);
    expect(view.container.textContent).toContain("More");

    const final = `${head}Still typing.\n\n<Callout>Second</Callout>\n\nMore text.`;
    view.rerender(<RichMessageContent content={final} isStreaming={false} feedback={feedback} />);
    // Until the completed message compiles, observers see it pending.
    expect(view.container.querySelector('[data-ui-render="pending"]')).toBeTruthy();
    await waitFor(() =>
      expect(view.container.querySelector('[data-ui-render="pending"]')).toBeNull(),
    );
    expect(view.container.textContent).toContain("More text.");
    expect(callout(view.container)).toBe(first);
    expect(publish).not.toHaveBeenCalled();
  });

  it("shows a failing streamed prefix's fallback unreported, and reports the completed message", async () => {
    const { publish, feedback } = target();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const head = "Intro.\n\n<Slider min={0} max={10} />\n\n";
    const view = render(
      <RichMessageContent content={`${head}Tail`} isStreaming feedback={feedback} />,
    );
    // The unknown component fails to render; the prefix falls back to text.
    await waitFor(() =>
      expect(debug).toHaveBeenCalledWith(
        "MDX render failed, using plain-text fallback:",
        expect.anything(),
      ),
    );
    expect(view.container.textContent).toContain("<Slider");
    expect(view.container.textContent).toContain("Tail");
    expect(publish).not.toHaveBeenCalled();

    view.rerender(
      <RichMessageContent content={`${head}Tail.`} isStreaming={false} feedback={feedback} />,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const [, event] = publish.mock.calls[0] as unknown as [
      string,
      { payload: Record<string, unknown> },
    ];
    expect(event.payload).toMatchObject({ category: "render_failed" });
    debug.mockRestore();
    errors.mockRestore();
  });

  it("keeps an unclosed element streaming as Markdown without compiling it", async () => {
    const { publish, feedback } = target();
    const view = render(
      <RichMessageContent
        content={"Intro.\n\n<Callout>\n\nInside, still open"}
        isStreaming
        feedback={feedback}
      />,
    );
    await waitFor(() => expect(view.container.textContent).toContain("Inside, still open"));
    expect(callout(view.container)).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });
});
