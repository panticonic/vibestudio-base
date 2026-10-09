// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxImportLoader } from "@workspace/eval";
import { ChatMessageActionsContext } from "../context/ChatContext";
import { compileMessageMdx } from "./messageMdx";
import { installPanelModules } from "./panelModules.testing";
import { RichMessageContent } from "./RichMessageContent";

let restorePanelModules: () => void;
beforeEach(() => {
  restorePanelModules = installPanelModules();
});
afterEach(() => restorePanelModules());

function feedbackTarget() {
  const publish = vi.fn(async () => undefined);
  return {
    publish,
    feedback: {
      chat: { publish },
      author: { kind: "agent", id: "agent:author" },
      messageId: "m1",
      turnId: "turn-1",
    },
  };
}

describe("compileMessageMdx", () => {
  it("renders a stateless component the message exports", async () => {
    const Mdx = await compileMessageMdx(
      [
        "export const Greeting = ({ name }) => <strong>Hello, {name}</strong>;",
        "",
        "Intro text.",
        "",
        '<Greeting name="Ada" />',
      ].join("\n"),
    );
    render(<Mdx />);
    expect(screen.getByText("Hello, Ada").tagName).toBe("STRONG");
    expect(screen.getByText("Intro text.")).toBeTruthy();
  });

  it("renders a stateful component importing React hooks and Radix, updating on interaction", async () => {
    const Mdx = await compileMessageMdx(
      [
        "Click to step through the cycle.",
        "",
        'import { useState } from "react";',
        'import { Button, Text } from "@radix-ui/themes";',
        "",
        "export function StrokeStepper() {",
        "  const [i, setI] = useState(0);",
        '  const strokes = ["Intake", "Compression", "Power", "Exhaust"];',
        "",
        "  return <><Button onClick={() => setI((i + 1) % 4)}>Next stroke</Button><Text>{strokes[i]}</Text></>;",
        "}",
        "",
        "<StrokeStepper />",
      ].join("\n"),
    );
    render(<Mdx />);
    expect(screen.getByText("Intake")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next stroke" }));
    expect(screen.getByText("Compression")).toBeTruthy();
  });

  it("imports catalog components from @workspace/react alongside registry tags", async () => {
    const Mdx = await compileMessageMdx(
      [
        'import { Stats as Figures } from "@workspace/react";',
        "",
        'export const Summary = () => <Figures items={[{ label: "Users", value: 1200 }]} />;',
        "",
        "<Summary />",
        "",
        '<Stats items={[{ label: "Errors", value: 7 }]} />',
      ].join("\n"),
    );
    render(<Mdx />);
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("fails compilation for an import the panel cannot resolve", async () => {
    await expect(
      compileMessageMdx('import { thing } from "left-pad-nonexistent";\n\n<Callout>{thing}</Callout>'),
    ).rejects.toThrow(/left-pad-nonexistent/);
  });
});

describe("RichMessageContent message modules", () => {
  it("reports an unresolvable import as compile_failed with the turn ref", async () => {
    const { publish, feedback } = feedbackTarget();
    const view = render(
      <RichMessageContent
        content={'import { thing } from "left-pad-nonexistent";\n\nUses {thing}.'}
        isStreaming={false}
        feedback={feedback}
      />,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const [, event] = publish.mock.calls[0] as unknown as [
      string,
      { payload: Record<string, unknown> },
    ];
    expect(event.payload).toMatchObject({
      category: "compile_failed",
      refs: { messageId: "m1", turnId: "turn-1" },
    });
    expect((event.payload["error"] as { message: string }).message).toContain(
      "left-pad-nonexistent",
    );
    expect(view.container.querySelector("[data-ui-render=pending]")).toBeNull();
  });

  it("reports a hook misuse as render_failed", async () => {
    const { publish, feedback } = feedbackTarget();
    render(
      <RichMessageContent
        content={[
          'import { useState } from "react";',
          "",
          "export const Broken = () => { const [v] = useState(() => { throw new Error(\"bad state\"); }); return v; };",
          "",
          "<Broken />",
        ].join("\n")}
        isStreaming={false}
        feedback={feedback}
      />,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const [, event] = publish.mock.calls[0] as unknown as [
      string,
      { payload: Record<string, unknown> },
    ];
    expect(event.payload).toMatchObject({ category: "render_failed" });
  });

  it("resolves imports through the panel's import loader from the chat context", async () => {
    const loadImport = vi.fn(async () => {
      throw new Error("build failed for left-pad-nonexistent");
    }) as unknown as SandboxImportLoader;
    loadImport.resolveWorkspaceImport = vi.fn(async () => true);
    const { publish, feedback } = feedbackTarget();
    render(
      <ChatMessageActionsContext.Provider value={{ importLoader: loadImport } as never}>
        <RichMessageContent
          content={'import pad from "left-pad-nonexistent";\n\n{pad}'}
          isStreaming={false}
          feedback={feedback}
        />
      </ChatMessageActionsContext.Provider>,
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(loadImport).toHaveBeenCalledWith(
      "left-pad-nonexistent",
      undefined,
      expect.any(Array),
    );
  });

  it("does not treat import lines inside fenced code as a message module", async () => {
    const { publish, feedback } = feedbackTarget();
    const view = render(
      <RichMessageContent
        content={'Use it like so:\n\n```ts\nimport { x } from "y";\n```\n\nThen { braces } stay prose.'}
        isStreaming={false}
        feedback={feedback}
      />,
    );
    expect(view.container.querySelector("[data-ui-render=pending]")).toBeNull();
    expect(view.container.textContent).toContain("{ braces }");
    expect(publish).not.toHaveBeenCalled();
  });
});
