/**
 * Progressive rendering of a streaming MDX message: the message is split at
 * the end of its last COMPLETE top-level block, so the finished blocks can be
 * compiled and rendered as MDX while the in-progress tail streams as Markdown.
 *
 * Block structure comes from the MDX parser itself (the same remark-mdx +
 * GFM parse `compileMessageMdx` compiles with), never from line patterns:
 * a top-level node's source position delimits the block.
 */

/** A parsed MDX tree, as far as splitting needs it (an mdast `Root`). */
export interface MdxBlockTree {
  children: ReadonlyArray<{
    type: string;
    position?: { end: { offset?: number | undefined } } | undefined;
  }>;
}

/** Parses MDX source, throwing when it is not (yet) well-formed MDX. */
export type MdxBlockParser = (source: string) => MdxBlockTree;

export interface StreamingMdxSplit {
  /** Whole top-level blocks: a well-formed MDX document on its own. */
  prefix: string;
  /** The in-progress tail, starting where the prefix ends. */
  remainder: string;
}

// Containers that a blank line does not end: a following indented line (or,
// for a list, the next item) continues them, so they are complete only once a
// sibling block has begun.
const BLANK_LINE_CONTINUABLE = new Set(["list", "footnoteDefinition"]);

// Line endings that make an empty line: a blank line ends every other block.
const BLANK_LINE_RE = /\r?\n[ \t]*\r?\n/g;
const LEADING_BLANK_LINE_RE = /^[ \t]*\r?\n[ \t]*\r?\n/;

// A trailing paragraph that cannot join or continue any block before it.
const PROBE_BLOCK = "\n\nx";

function tryParse(parse: MdxBlockParser, source: string): MdxBlockTree["children"] | null {
  try {
    return parse(source).children;
  } catch {
    // The parser rejects a construct that is not yet finished (an unclosed
    // tag, expression, or ESM statement); the caller retreats before it.
    return null;
  }
}

function endOffset(block: MdxBlockTree["children"][number]): number {
  const offset = block.position?.end.offset;
  if (offset === undefined) throw new Error(`MDX ${block.type} node has no source position`);
  return offset;
}

/**
 * Whether the last block of `blocks` (parsed from a prefix of `content`) is
 * finished: a blank line follows it in the content, it is not a container a
 * blank line leaves open, and the parser confirms that a block after it would
 * start a new top-level block rather than continue it (an unterminated fence
 * absorbs the probe).
 */
function lastBlockComplete(
  content: string,
  blocks: MdxBlockTree["children"],
  parse: MdxBlockParser,
): boolean {
  const last = blocks[blocks.length - 1]!;
  if (BLANK_LINE_CONTINUABLE.has(last.type)) return false;
  const end = endOffset(last);
  if (!LEADING_BLANK_LINE_RE.test(content.slice(end))) return false;
  const probed = tryParse(parse, content.slice(0, end) + PROBE_BLOCK);
  return (
    probed !== null &&
    probed.length === blocks.length + 1 &&
    endOffset(probed[blocks.length - 1]!) === end
  );
}

/**
 * Split streaming MDX content at the end of its last complete top-level block.
 *
 * Every top-level block followed by another block is complete. The final block
 * is complete only once a blank line ends it (see `lastBlockComplete`). When
 * the content does not parse — the tail is an unclosed JSX element, `{`
 * expression, or ESM statement — the split retreats to the latest blank line
 * before which the content parses; blocks there are judged the same way, so
 * a cut inside a fence or an open element never yields a prefix.
 */
export function splitStreamingMdx(content: string, parse: MdxBlockParser): StreamingMdxSplit {
  const cuts = [content.length];
  for (const match of content.matchAll(BLANK_LINE_RE)) cuts.push(match.index);
  cuts.sort((a, b) => b - a);

  let end = 0;
  for (const cut of cuts) {
    const blocks = tryParse(parse, content.slice(0, cut));
    if (!blocks) continue;
    if (blocks.length > 0) {
      end = lastBlockComplete(content, blocks, parse)
        ? endOffset(blocks[blocks.length - 1]!)
        : blocks.length > 1
          ? endOffset(blocks[blocks.length - 2]!)
          : 0;
    }
    break;
  }
  return { prefix: content.slice(0, end), remainder: content.slice(end) };
}
