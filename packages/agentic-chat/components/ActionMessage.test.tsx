// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { describe, expect, it } from "vitest";
import { ActionPill, toolPresentation } from "./ActionMessage";
import { getStatusKey } from "./shared/invocationStatus";

function renderPill(payload: Parameters<typeof ActionPill>[0]["payload"]) {
  return render(
    <Theme>
      <ActionPill id={payload.id} payload={payload} onExpand={() => undefined} />
    </Theme>,
  );
}

describe("ActionPill status presentation", () => {
  it("shows a completed failed verification as amber without changing invocation completion", () => {
    const payload = {
      id: "call:verify",
      name: "verify",
      arguments: { operation: "build", target: "panels/editor" },
      execution: {
        status: "complete" as const,
        description: "",
        result: {
          details: {
            operation: "build",
            target: "panels/editor",
            status: "failed",
            report: { status: "failed" },
            receipt: { status: "failed" },
          },
        },
      },
    };

    expect(toolPresentation(payload)).toEqual({
      displayName: "Verify",
      preview: "Build failed · panels/editor",
      color: "amber",
    });
    expect(getStatusKey(payload)).toBe("complete");

    renderPill(payload);

    const pill = screen.getByTestId("invocation-pill");
    expect(pill.getAttribute("title")).toContain("Build failed · panels/editor");
    expect(pill.getAttribute("data-invocation-status")).toBe("complete");
    expect(pill.getAttribute("style")).toContain("var(--amber-a3)");
    expect(pill.firstElementChild?.getAttribute("style")).toContain("var(--amber-9)");
  });

  it("keeps a semantic amber hint from overriding an actual invocation error", () => {
    const payload = {
      id: "call:edit",
      name: "edit",
      arguments: { path: "panels/editor.ts" },
      execution: {
        status: "error" as const,
        description: "",
        isError: true,
        result: {
          details: {
            protocol: "file-mutation.v1",
            status: "conflict",
            storage: "vcs",
            operations: [],
            conflicts: [],
          },
        },
      },
    };

    expect(toolPresentation(payload).color).toBe("amber");
    expect(getStatusKey(payload)).toBe("error");

    renderPill(payload);

    const pill = screen.getByTestId("invocation-pill");
    expect(pill.getAttribute("data-invocation-status")).toBe("error");
    expect(pill.getAttribute("style")).toContain("var(--red-a3)");
    expect(pill.firstElementChild?.getAttribute("style")).toContain("var(--red-9)");
  });
});
