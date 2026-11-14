/**
 * The search terms of a question: exact identifiers first (`launch_automation`, `vcs.commit`,
 * `WORKSPACE_RPC_METHOD_UNDECLARED`, `schemaVersion`), then its content words. At most eight.
 */

const STOP = new Set(
  "about after again also does doing done each from have here into just like make more most must need only other over same should some such than that their them then there these they this those through under used using want what when where which while with without would your how why can cannot could will".split(
    " ",
  ),
);

/** An identifier a document would spell the same way: dotted, snake or camel case, or a code in capitals. */
function exact(token: string): boolean {
  return /[._]/u.test(token) || /[a-z][A-Z]/u.test(token) || /^[A-Z][A-Z0-9_]{3,}$/u.test(token);
}

export default function keywords(question: string): string[] {
  const tokens: string[] = question.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/gu) ?? [];
  const identifiers = tokens.filter(exact);
  const words = tokens
    .filter((token) => !exact(token) && token.length >= 4 && !STOP.has(token.toLowerCase()))
    .map((token) => token.toLowerCase());
  return [...new Set([...identifiers, ...words])].slice(0, 8);
}
