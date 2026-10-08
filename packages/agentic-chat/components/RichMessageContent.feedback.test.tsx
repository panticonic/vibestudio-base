// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichMessageContent } from "./RichMessageContent.js";

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

const BROKEN_MDX = "<Callout>unclosed";

describe("RichMessageContent ui.feedback", () => {
  it("reports an MDX compile failure to the author once and keeps the markdown fallback", async () => {
    const { publish, feedback } = target();
    const view = render(
      <RichMessageContent
        content={BROKEN_MDX}
        isStreaming={false}
        feedback={feedback}
      />,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const [, event, options] = publish.mock.calls[0] as unknown as [
      string,
      { payload: Record<string, unknown> },
      { idempotencyKey: string },
    ];
    expect(event.payload).toMatchObject({
      category: "compile_failed",
      target: { kind: "agent", id: "agent:author" },
      refs: { messageId: "m1" },
    });
    expect(options.idempotencyKey).toBe(
      `ui-feedback:${event.payload["occurrenceKey"]}`,
    );
    expect(view.container.textContent).toContain("unclosed");
    view.rerender(
      <RichMessageContent
        content={BROKEN_MDX}
        isStreaming={false}
        feedback={{ ...feedback }}
      />,
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("exposes compile settlement and report delivery to panel observers", async () => {
    let deliver!: () => void;
    const publish = vi.fn(
      () => new Promise<undefined>((resolve) => (deliver = () => resolve(undefined))),
    );
    const view = render(
      <RichMessageContent
        content={BROKEN_MDX}
        isStreaming={false}
        feedback={{
          chat: { publish },
          author: { kind: "agent", id: "agent:author" },
          messageId: "m1",
        }}
      />,
    );
    // Until compilation settles the Markdown is a pending placeholder.
    expect(view.container.querySelector('[data-ui-render="pending"]')).toBeTruthy();
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(view.container.querySelector('[data-ui-render="pending"]')).toBeNull();
    const marker = () =>
      view.container.querySelector<HTMLElement>("[data-ui-feedback-occurrence]");
    expect(marker()?.dataset["uiFeedbackCategory"]).toBe("compile_failed");
    expect(marker()?.dataset["uiFeedbackDelivery"]).toBe("sending");
    deliver();
    await waitFor(() => expect(marker()?.dataset["uiFeedbackDelivery"]).toBe("sent"));
  });

  it("does not report while streaming or without a feedback target", async () => {
    const { publish, feedback } = target();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    render(
      <RichMessageContent content={BROKEN_MDX} isStreaming feedback={feedback} />,
    );
    render(<RichMessageContent content={BROKEN_MDX} isStreaming={false} />);
    // The non-streaming compile fails (logged); only it runs, and has no target.
    await waitFor(() => expect(debug).toHaveBeenCalledTimes(1));
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not treat prose generics as MDX", async () => {
    const { publish, feedback } = target();
    const view = render(
      <RichMessageContent
        content={"Use `Array<T>` or Map<K, V> here; a Promise<Result> resolves later."}
        isStreaming={false}
        feedback={feedback}
      />,
    );
    await waitFor(() => expect(view.container.textContent).toContain("resolves later"));
    expect(publish).not.toHaveBeenCalled();
  });

  it("reports an unknown self-closing component", async () => {
    const { publish, feedback } = target();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <RichMessageContent
        content={"Try this:\n\n<Slider min={0} max={10} />"}
        isStreaming={false}
        feedback={feedback}
      />,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    errors.mockRestore();
  });

  it("reports rejected catalog props to the author once per occurrence", async () => {
    const { publish, feedback } = target();
    const content = '<Stats items="nope" />';
    const view = render(
      <RichMessageContent content={content} isStreaming={false} feedback={feedback} />,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const [, event] = publish.mock.calls[0] as unknown as [
      string,
      { payload: Record<string, unknown> },
    ];
    expect(event.payload).toMatchObject({
      category: "props_invalid",
      target: { kind: "agent", id: "agent:author" },
      refs: { messageId: "m1", component: "Stats" },
    });
    expect(view.container.querySelector(".vs-r-problem")).toBeTruthy();
    view.rerender(
      <RichMessageContent content={content} isStreaming={false} feedback={{ ...feedback }} />,
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("renders rejected props without reporting when there is no feedback target", async () => {
    const view = render(
      <RichMessageContent content={'<Stats items="nope" />'} isStreaming={false} />,
    );
    await waitFor(() =>
      expect(view.container.querySelector(".vs-r-problem")).toBeTruthy(),
    );
  });
});
