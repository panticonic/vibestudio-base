/**
 * Standard terminal control sequences the chat uses to talk to whatever
 * terminal shows it (the terminal browser, the desktop terminal panel, or a
 * plain terminal emulator). No custom protocol: a terminal that does not
 * understand one of these ignores it.
 */
const ESC = "\x1b";
const BEL = "\x07";

function clean(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, max);
}

/** OSC 2: window/tab title. */
export function titleSequence(title: string): string {
  return `${ESC}]2;${clean(title, 80)}${BEL}`;
}

/** Attention: OSC 9 notification text, then BEL (which terminals turn into a badge or bell). */
export function attentionSequence(reason: string): string {
  return `${ESC}]9;${clean(reason, 120)}${BEL}${BEL}`;
}

/** OSC 8 hyperlink around `text` (the URL itself by default). */
export function hyperlink(url: string, text = url): string {
  return `${ESC}]8;;${clean(url, 4096)}${BEL}${text}${ESC}]8;;${BEL}`;
}

/** OSC 52: put `text` on the clipboard of the person's terminal. */
export function copySequence(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `${ESC}]52;c;${btoa(binary)}${BEL}`;
}

/** Modes the chat turns on while it runs: bracketed paste and focus reporting. */
export const ENTER_MODES = `${ESC}[?2004h${ESC}[?1004h`;
export const LEAVE_MODES = `${ESC}[?1004l${ESC}[?2004l`;
