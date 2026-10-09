import React, { type ReactNode, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Text } from "@radix-ui/themes";
import { useOptionalChatMessageActions } from "../context/ChatContext";
import {
  markdownComponents,
  mdxComponents,
  streamingMarkdownComponents,
} from "./markdownComponents";
import {
  BLOCK_CODE_RE,
  compileMessageMdx,
  getMdxParser,
  getRehypeHighlight,
  loadedMdxParser,
  loadedRehypeHighlight,
  type MessageMdx,
  type RehypeHighlightPlugin,
} from "./messageMdx";
import { splitStreamingMdx, type MdxBlockParser } from "./streamingMdx";
import {
  ResponseProblemFeedback,
  UiFeedbackReporter,
  type UiFeedbackAuthor,
} from "./UiFeedbackReporter";

/**
 * Where to send MDX failure feedback: the agent that authored the message.
 * Absent for content the model did not author (user text, descriptions).
 */
export interface MessageFeedbackTarget {
  chat: Record<string, unknown>;
  author: UiFeedbackAuthor;
  messageId: string;
  /** Turn that produced the message; lets the agent attribute the failure. */
  turnId?: string;
}

function feedbackRefs(feedback: MessageFeedbackTarget) {
  return {
    messageId: feedback.messageId as never,
    ...(feedback.turnId ? { turnId: feedback.turnId as never } : {}),
  };
}

interface RichMessageContentProps {
  content: string;
  isStreaming: boolean;
  feedback?: MessageFeedbackTarget;
}

/** Stable per-content identity (FNV-1a) so an edited message re-reports. */
function contentFingerprint(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function MdxFailureReporter({
  feedback,
  content,
  category,
  error,
}: {
  feedback: MessageFeedbackTarget | undefined;
  content: string;
  category: "compile_failed" | "render_failed";
  error: unknown;
}) {
  if (!feedback) return null;
  const err = error instanceof Error ? error : new Error(String(error));
  return (
    <UiFeedbackReporter
      chat={feedback.chat}
      author={feedback.author}
      category={category}
      refs={feedbackRefs(feedback)}
      errorMessage={err.message || "Unknown error"}
      errorName={err.name || "Error"}
      stack={err.stack}
      occurrenceKey={`mdx_${category}:${feedback.messageId}:${contentFingerprint(content)}`}
    />
  );
}

const remarkPlugins = [remarkGfm];

/**
 * Catches a render failure of one compiled source. A new source (the next
 * streamed prefix, the completed message) clears the failure in place, so the
 * compiled tree under it is never remounted merely because it grew.
 */
class MdxRenderErrorBoundary extends React.Component<
  { source: string; children: ReactNode; renderFallback: (error: unknown) => ReactNode },
  { source: string; failure: { error: unknown } | null }
> {
  constructor(props: MdxRenderErrorBoundary["props"]) {
    super(props);
    this.state = { source: props.source, failure: null };
  }

  static getDerivedStateFromProps(
    props: MdxRenderErrorBoundary["props"],
    state: MdxRenderErrorBoundary["state"],
  ) {
    return props.source === state.source ? null : { source: props.source, failure: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } };
  }

  componentDidCatch(error: unknown) {
    console.debug("MDX render failed, using plain-text fallback:", error);
  }

  render() {
    return this.state.failure
      ? this.props.renderFallback(this.state.failure.error)
      : this.props.children;
  }
}

/** One stable component type for every compile of a message (see MessageMdx). */
function CompiledMdxBody({ render }: { render: MessageMdx }) {
  return render();
}

function PlainTextMessageContent({ content }: { content: string }) {
  return (
    <div className="message-prose">
      <Text as="div" size="2" style={{ whiteSpace: "pre-wrap" }}>
        {content}
      </Text>
    </div>
  );
}

// Compile MDX when a capitalized tag names a registered component (so an
// unclosed `<Callout>` still compiles, fails, and is reported) or is shaped
// like an element: self-closing (`<Slider ... />`) or closed (`</Slider>`), so
// an unknown component is reported too. Prose generics such as `Array<T>` or
// `Map<K, V>` are neither and render as Markdown without a spurious failure
// report. Props may span lines and contain `=>`, so the opening tag and its
// terminator are matched separately.
const JSX_OPENING_RE = /<([A-Z][\w.]*)(?=[\s/>])/g;
const REGISTERED_COMPONENTS = new Set(
  Object.keys(mdxComponents).filter((name) => /^[A-Z]/.test(name)),
);

// A message that defines its own components (`import { useState } from
// "react"`, `export function Stepper() {…}`) is an MDX module. Only statements
// outside fenced code count: an `import` line inside a ```ts snippet is prose.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const ESM_STATEMENT_RE =
  /^(?:import\s*(?:["']|[\w$*{][^\n]*?\bfrom\s*["'])|export\s+(?:default\b|const\b|let\b|var\b|function\b|async\s+function\b|class\b|\{|\*))/;

function containsEsmStatement(content: string): boolean {
  let fence: string | null = null;
  for (const line of content.split("\n")) {
    const opener = FENCE_RE.exec(line)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null;
    } else if (opener) {
      fence = opener;
    } else if (ESM_STATEMENT_RE.test(line)) {
      return true;
    }
  }
  return false;
}

function containsJsxElement(content: string): boolean {
  for (const match of content.matchAll(JSX_OPENING_RE)) {
    const name = match[1]!;
    if (REGISTERED_COMPONENTS.has(name.split(".")[0]!)) return true;
    const rest = content.slice(match.index + match[0].length);
    if (rest.includes("/>") || rest.includes(`</${name}`)) return true;
  }
  return containsEsmStatement(content);
}

interface CompiledSource {
  source: string;
  render: MessageMdx;
}

interface CompileFailure {
  source: string;
  error: unknown;
}

/**
 * Renders a message as MDX when it contains JSX or ESM, as Markdown otherwise.
 *
 * While the message streams, its complete top-level blocks (the prefix found
 * by `splitStreamingMdx`) compile and render as MDX and the in-progress tail
 * renders as streaming Markdown; each longer prefix recompiles, and the
 * previous compile stays rendered until the next one settles. Once complete,
 * the whole message compiles exactly as a message that never streamed.
 * Failures are reported to the author only for the completed message: a
 * streamed prefix that fails to compile or render shows the same fallback,
 * unreported.
 */
export const RichMessageContent = React.memo(function RichMessageContent({
  content,
  isStreaming,
  feedback,
}: RichMessageContentProps) {
  const [compiled, setCompiled] = useState<CompiledSource | null>(null);
  const [compileFailure, setCompileFailure] = useState<CompileFailure | null>(null);
  const [highlightLoaded, setHighlightLoaded] = useState<RehypeHighlightPlugin | null>(
    loadedRehypeHighlight
  );
  const [parser, setParser] = useState<MdxBlockParser | null>(loadedMdxParser);
  // The panel's import loader: message imports resolve exactly as inline UI's.
  const loadImport = useOptionalChatMessageActions()?.importLoader;
  const hasJsx = containsJsxElement(content);
  const needsHighlight = !isStreaming && BLOCK_CODE_RE.test(content);
  const needsParser = isStreaming && hasJsx;

  useEffect(() => {
    if (!needsHighlight || loadedRehypeHighlight()) return;
    void getRehypeHighlight().then(setHighlightLoaded);
  }, [needsHighlight]);

  useEffect(() => {
    if (!needsParser || parser) return;
    // Until the parser loads the message streams as Markdown; a load failure
    // leaves it so, and the completed message's compile reports the toolchain.
    getMdxParser().then(
      (loaded) => setParser(() => loaded),
      (error) => console.debug("MDX parser unavailable while streaming:", error),
    );
  }, [needsParser, parser]);

  // The source to render as MDX: the complete blocks while streaming, the
  // whole message once complete; null when it has no JSX or ESM to compile.
  const streamedPrefix = useMemo(
    () => (needsParser && parser ? splitStreamingMdx(content, parser).prefix : ""),
    [content, needsParser, parser],
  );
  const mdxSource = isStreaming ? streamedPrefix : content;
  const target = mdxSource && containsJsxElement(mdxSource) ? mdxSource : null;

  useEffect(() => {
    if (!target) return;
    // A newer target supersedes this compile; its result is dropped.
    let cancelled = false;
    compileMessageMdx(target, { loadImport })
      .then((render) => {
        if (!cancelled) setCompiled({ source: target, render });
      })
      .catch((error) => {
        if (!cancelled) {
          console.debug("MDX compilation failed, using markdown fallback:", error);
          setCompileFailure({ source: target, error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [target, loadImport]);

  const targetFailed = target !== null && compileFailure?.source === target;
  // The latest successful compile stays rendered while a longer prefix
  // compiles; the message text after it renders as Markdown.
  const shown =
    target !== null && !targetFailed && compiled && content.startsWith(compiled.source)
      ? compiled
      : null;
  const complete = !isStreaming && shown?.source === content;
  const markdown = shown ? content.slice(shown.source.length) : content;

  const rehypePlugins =
    !isStreaming && highlightLoaded
      ? ([[highlightLoaded, { ignoreMissing: true }]] as [
          RehypeHighlightPlugin,
          { ignoreMissing: boolean },
        ][])
      : [];

  // Until MDX compilation of the completed message settles, the Markdown is a
  // placeholder for the component render; observers of the panel wait on it.
  const pending = !isStreaming && target !== null && !complete && !targetFailed;
  return (
    <>
      {shown ? (
        <MdxRenderErrorBoundary
          source={shown.source}
          renderFallback={(error) => (
            <>
              {complete ? (
                <MdxFailureReporter
                  feedback={feedback}
                  content={content}
                  category="render_failed"
                  error={error}
                />
              ) : null}
              <PlainTextMessageContent content={shown.source} />
            </>
          )}
        >
          <div className="message-prose">
            {feedback ? (
              <ResponseProblemFeedback
                chat={feedback.chat}
                author={feedback.author}
                refs={feedbackRefs(feedback)}
                scope={`mdx:${feedback.messageId}:${contentFingerprint(shown.source)}`}
                reporting={complete}
              >
                <CompiledMdxBody render={shown.render} />
              </ResponseProblemFeedback>
            ) : (
              <CompiledMdxBody render={shown.render} />
            )}
          </div>
        </MdxRenderErrorBoundary>
      ) : null}
      {markdown.trim() || pending ? (
        <div className="message-prose" data-ui-render={pending ? "pending" : undefined}>
          {targetFailed && !isStreaming ? (
            <MdxFailureReporter
              feedback={feedback}
              content={content}
              category="compile_failed"
              error={compileFailure!.error}
            />
          ) : null}
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={isStreaming ? streamingMarkdownComponents : markdownComponents}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      ) : null}
    </>
  );
});
