import { describe, expect, it } from "vitest";
import keywords from "./docHelp/keywords.js";
import sections from "./docHelp/sections.js";
import typedCause from "./docHelp/typedCause.js";
import nextStep from "./docHelp/nextStep.js";
import type { Cause } from "./types.js";

describe("keywords", () => {
  it("puts identifiers first, then content words, at most eight", () => {
    expect(
      keywords(
        "Why does launch_automation fail with WORKSPACE_RPC_METHOD_UNDECLARED after vcs.commit?",
      ),
    ).toEqual([
      "launch_automation",
      "WORKSPACE_RPC_METHOD_UNDECLARED",
      "vcs.commit",
      "fail",
    ]);
    expect(
      keywords(
        "How do I typecheck one unit of my workspace before I publish it?",
      ),
    ).toEqual(["typecheck", "unit", "workspace", "before", "publish"]);
    expect(keywords("a b c")).toEqual([]);
  });
});

describe("sections", () => {
  const DOC = [
    "# Sandbox",
    "",
    "Intro paragraph.",
    "",
    "## Completion rules",
    "",
    "- Keep eval results small.",
    "- Close temporary panels.",
    "",
    "```sh",
    "# not a heading",
    "```",
    "",
    "### Nested",
    "",
    "Nested text.",
  ].join("\n");

  it("keeps each heading with its text, with the heading path, as exact slices", () => {
    const read = sections(DOC);
    expect(read.map((section) => section.heading)).toEqual([
      "Sandbox",
      "Sandbox > Completion rules",
      "Sandbox > Completion rules > Nested",
    ]);
    expect(read[1]!.text).toContain("# not a heading");
    for (const section of read) expect(DOC).toContain(section.text);
  });

  it("splits a long section at paragraph boundaries within the limit", () => {
    const long = [
      "## Big",
      "",
      ...Array.from(
        { length: 6 },
        (_, index) => `${"word ".repeat(40)}${index}`,
      ),
    ].join("\n\n");
    const read = sections(long, 500);
    expect(read.length).toBeGreaterThan(1);
    for (const section of read) {
      expect(section.text.length).toBeLessThanOrEqual(500);
      expect(long).toContain(section.text);
    }
  });
});

describe("typedCause", () => {
  const failed = (error: Record<string, unknown>) => ({
    call: "x",
    error: { message: "m", ...error },
  });

  it("reads an authority failure's reason and keeps its remediation exactly", () => {
    expect(
      typedCause(
        failed({
          errorKind: "access",
          errorData: {
            authorityFailure: {
              reasonCode: "approval-required",
              remediation: {
                kind: "request-user-approval",
                message:
                  "Request user approval, then retry the exact invocation.",
              },
            },
          },
        }),
      ),
    ).toEqual({
      cause: "needs-approval",
      remediation: "Request user approval, then retry the exact invocation.",
    });
    expect(
      typedCause(
        failed({
          errorData: {
            authorityFailure: { reasonCode: "fixed-code-not-requested" },
          },
        }),
      )?.cause,
    ).toBe("missing-authority");
  });

  it("reads an agent-tool failure's kind and retry policy", () => {
    const tool = (kind: string, policy: string) => ({
      errorData: {
        protocol: "agent-tool-failure.v1",
        kind,
        retry: { policy },
        recovery: { action: "correct-request", instruction: "Pass a name." },
      },
    });
    expect(typedCause(failed(tool("invalid-input", "correct-input")))).toEqual({
      cause: "bad-arguments",
      remediation: "Pass a name.",
    });
    expect(
      typedCause(failed(tool("authority", "request-approval")))?.cause,
    ).toBe("needs-approval");
    expect(typedCause(failed(tool("authority", "none")))?.cause).toBe(
      "missing-authority",
    );
    expect(typedCause(failed(tool("domain", "none")))).toBeNull();
  });

  it("reads VCS codes, the eval failure kind and the RPC error kind; leaves plain text to the model", () => {
    expect(typedCause(failed({ code: "WorkingChangesPresent" }))?.cause).toBe(
      "wrong-context",
    );
    expect(
      typedCause(failed({ errorData: { code: "InvalidReference" } }))?.cause,
    ).toBe("bad-arguments");
    expect(typedCause(failed({ failureKind: "infrastructure" }))?.cause).toBe(
      "platform-defect",
    );
    expect(typedCause(failed({ errorKind: "transport" }))?.cause).toBe(
      "transient",
    );
    expect(typedCause(failed({ errorKind: "application" }))).toBeNull();
    expect(typedCause(failed({}))).toBeNull();
  });
});

describe("nextStep", () => {
  it("has a step for every cause", () => {
    const causes: Cause[] = [
      "bad-arguments",
      "wrong-context",
      "missing-authority",
      "needs-approval",
      "transient",
      "platform-defect",
      "unknown",
    ];
    for (const cause of causes)
      expect(nextStep(cause).length).toBeGreaterThan(20);
  });
});

describe("retrieval ranking", () => {
  it("prioritizes a rare discriminating term over repeated common boilerplate", async () => {
    const { default: rank } = await import("./docHelp/rank.js");
    const ordinary = Array.from({ length: 20 }, (_, index) => ({
      source: `ordinary-${index}`,
      section: "Panel",
      text: "panel before publish ".repeat(15),
    }));
    const answer = {
      source: "guide",
      section: "Typecheck",
      text: "Typecheck a panel by asking for its diagnostic report.",
    };
    expect(
      rank(
        ["typecheck", "panel", "before", "publish"],
        [...ordinary, answer],
      )[0],
    ).toEqual(answer);
  });

  it("retains the tail of a paragraph longer than one section", () => {
    const text =
      "# Guide\n\n" + "word ".repeat(500) + "the concluding instruction";
    const pieces = sections(text);
    expect(
      pieces.some((piece) => piece.text.endsWith("the concluding instruction")),
    ).toBe(true);
    expect(pieces.every((piece) => text.includes(piece.text))).toBe(true);
  });
});
