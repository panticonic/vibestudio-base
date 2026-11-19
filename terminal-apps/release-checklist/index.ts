import { startTerminalApp } from "@workspace/terminal-app";
import { stdin, stdout } from "node:process";

const labels = ["Build prepared", "Review complete", "Rollback confirmed"];
const title = "Release checklist";

async function main() {
  const app = await startTerminalApp();
  const checked = () =>
    labels.map((_, index) => app.state.get()[String(index + 1)] === true);
  const draw = () => {
    const entries = checked();
    const lines = [
      title,
      `Viewport: ${stdout.columns}x${stdout.rows}`,
      "",
      ...labels.map(
        (label, index) =>
          `  ${index + 1} [${entries[index] ? "x" : " "}] ${label}`,
      ),
      "",
      "1–3 toggle · q quit",
    ];
    stdout.write(`\x1b[H\x1b[2J${lines.join("\r\n")}\r\n`);
  };
  const toggle = async (key: string) => {
    const previous = app.state.get()[key] === true;
    await app.state.patch({ [key]: !previous });
    draw();
  };
  let pending = "";
  try {
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdout.on("resize", draw);
    // Clicks use the same numbering as the displayed rows and the keyboard.
    stdout.write(`\x1b]2;${title}\x07\x1b[?1000h\x1b[?1006h`);
    draw();
    for await (const chunk of stdin.iterator({ destroyOnReturn: false })) {
      pending += String(chunk);
      while (pending.length) {
        if (pending.startsWith("\x1b")) {
          const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/u.exec(pending);
          if (mouse) {
            pending = pending.slice(mouse[0].length);
            const row = Number(mouse[3]);
            if (
              mouse[1] === "0" &&
              mouse[4] === "M" &&
              row >= 4 &&
              row <= 6 &&
              Number(mouse[2]) <= 27
            )
              await toggle(String(row - 3));
            continue;
          }
          // Keep a split mouse sequence until its last byte arrives. Other
          // control sequences are ignored rather than treated as item keys.
          if (/^\x1b(?:\[<?[\d;]*)?$/u.test(pending) && pending.length < 32)
            break;
          pending = pending.replace(/^\x1b(?:\[[^A-Za-z~]*[A-Za-z~])?/u, "");
          continue;
        }
        const key = pending[0];
        pending = pending.slice(1);
        if (key === "q" || key === "\x03") return;
        if (key === "1" || key === "2" || key === "3") await toggle(key);
      }
    }
  } finally {
    try {
      stdout.off("resize", draw);
      stdout.write("\x1b[?1006l\x1b[?1000l");
      stdin.pause();
      if (stdin.isRaw) stdin.setRawMode(false);
    } finally {
      await app.close();
    }
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `\r\nCannot run the checklist: ${error instanceof Error ? error.message : String(error)}\r\n`,
  );
  process.exitCode = 1;
}
