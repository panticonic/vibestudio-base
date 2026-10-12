import { describe, expect, it } from "vitest";
import { stripAnsi } from "./ansi.js";
import { htmlToAnsiLines, highlightLines } from "./highlight.js";
import { renderMarkdown } from "./markdown.js";

const plain = (source: string, columns = 60) => renderMarkdown(source, columns).map(stripAnsi);

describe("renderMarkdown", () => {
  it("renders headings, emphasis and inline code with standard ANSI styles", () => {
    const lines = renderMarkdown("# Title\n\nSome **bold** and `code`.", 60);
    expect(lines[0]).toContain("\x1b[1m");
    expect(stripAnsi(lines[0]!)).toBe("Title");
    expect(lines.join("\n")).toContain("\x1b[36mcode\x1b[39m");
    expect(lines.join("\n")).not.toMatch(/\x1b\[(4[0-7]|10[0-7]|48;)/); // never paints backgrounds
  });

  it("renders bullet, ordered and task lists with aligned continuation lines", () => {
    expect(plain("- one\n- two\n\n1. first\n2. second\n\n- [x] done\n- [ ] todo")).toEqual([
      "• one",
      "• two",
      "",
      "1. first",
      "2. second",
      "",
      "• [x] done",
      "• [ ] todo",
    ]);
    const wrapped = plain("- " + "word ".repeat(12), 20);
    expect(wrapped[0]!.startsWith("• ")).toBe(true);
    expect(wrapped.slice(1).every((line) => line.startsWith("  "))).toBe(true);
  });

  it("lays out tables as a grid when they fit and as records when they do not", () => {
    const table = "| Name | Size |\n| --- | ---: |\n| a.ts | 12 |\n| b.ts | 3 |";
    expect(plain(table)).toEqual(["Name │ Size", "─────┼─────", "a.ts │   12", "b.ts │    3"]);
    const narrow = plain("| Column one header | Column two header |\n| --- | --- |\n| value one | value two |", 20);
    expect(narrow.some((line) => line.startsWith("Column one header:"))).toBe(true);
    expect(narrow.join(" ")).toContain("value two");
  });

  it("highlights fenced code by language and frames it", () => {
    const lines = renderMarkdown("```ts\nconst x = 1; // note\n```", 60);
    expect(stripAnsi(lines[0]!)).toBe("╭─ ts ");
    expect(stripAnsi(lines[1]!)).toBe("│ const x = 1; // note");
    expect(lines[1]).toContain("\x1b[35mconst\x1b[39m");
    expect(stripAnsi(lines.at(-1)!)).toBe("╰─");
  });

  it("keeps unknown languages plain and shows markup as labelled verbatim text", () => {
    expect(highlightLines("x := 1", "nonsense")).toEqual(["x := 1"]);
    const html = plain("```html\n<b>hi</b>\n```");
    expect(html[0]).toBe("╭─ HTML ");
    expect(html[1]).toBe("│ <b>hi</b>");
  });

  it("quotes, links and images", () => {
    expect(plain("> quoted")).toEqual(["│ quoted"]);
    expect(plain("[docs](https://example.com/docs)")[0]).toBe("docs (https://example.com/docs)");
    expect(plain("![chart](https://example.com/a.png)")[0]).toBe("[image: chart]");
  });

  it("strips control sequences from model output", () => {
    expect(plain("evil \x1b[2J\x1b]52;c;AAAA\x07text")).toEqual(["evil text"]);
  });

  it("maps highlight.js spans per line so styles never leak across lines", () => {
    const lines = htmlToAnsiLines('<span class="hljs-comment">/* a\nb */</span>x');
    expect(lines).toEqual(["\x1b[3m\x1b[90m/* a\x1b[39m\x1b[23m", "\x1b[3m\x1b[90mb */\x1b[39m\x1b[23mx"]);
  });
});
