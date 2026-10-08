import React, { type ComponentType, type ReactNode, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Text } from "@radix-ui/themes";
import * as runtime from "react/jsx-runtime";
import {
  markdownComponents,
  mdxComponents,
  streamingMarkdownComponents,
} from "./markdownComponents";
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
      refs={{ messageId: feedback.messageId as never }}
      errorMessage={err.message || "Unknown error"}
      errorName={err.name || "Error"}
      stack={err.stack}
      occurrenceKey={`mdx_${category}:${feedback.messageId}:${contentFingerprint(content)}`}
    />
  );
}

let mdxModule: typeof import("@mdx-js/mdx") | null = null;
async function getMdx() {
  if (!mdxModule) {
    try {
      mdxModule = await import("@mdx-js/mdx");
    } catch (error) {
      throw new Error(
        `Failed to load MDX: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return mdxModule;
}

const remarkPlugins = [remarkGfm];

class MdxRenderErrorBoundary extends React.Component<
  { children: ReactNode; renderFallback: (error: unknown) => ReactNode },
  { failure: { error: unknown } | null }
> {
  state: { failure: { error: unknown } | null } = { failure: null };

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

function PlainTextMessageContent({ content }: { content: string }) {
  return (
    <div className="message-prose">
      <Text as="div" size="2" style={{ whiteSpace: "pre-wrap" }}>
        {content}
      </Text>
    </div>
  );
}

type RehypeHighlightPlugin = typeof import("rehype-highlight").default;
let rehypeHighlightPlugin: RehypeHighlightPlugin | null = null;
let rehypeHighlightPromise: Promise<RehypeHighlightPlugin> | null = null;

function getRehypeHighlight(): Promise<RehypeHighlightPlugin> {
  if (rehypeHighlightPlugin) return Promise.resolve(rehypeHighlightPlugin);
  if (!rehypeHighlightPromise) {
    rehypeHighlightPromise = import("rehype-highlight").then((module) => {
      rehypeHighlightPlugin = module.default;
      return rehypeHighlightPlugin;
    });
  }
  return rehypeHighlightPromise;
}

async function compileMdx(
  content: string,
  rehypeHighlight: RehypeHighlightPlugin | null
): Promise<ComponentType | null> {
  const rehypePlugins = rehypeHighlight
    ? ([[rehypeHighlight, { ignoreMissing: true }]] as [
        RehypeHighlightPlugin,
        { ignoreMissing: boolean },
      ][])
    : [];
  const { evaluate } = await getMdx();
  const { default: Component } = await evaluate(content, {
    ...runtime,
    development: false,
    useMDXComponents: (() => mdxComponents) as never,
    remarkPlugins,
    rehypePlugins,
  });
  return Component as ComponentType;
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

function containsJsxElement(content: string): boolean {
  for (const match of content.matchAll(JSX_OPENING_RE)) {
    const name = match[1]!;
    if (REGISTERED_COMPONENTS.has(name.split(".")[0]!)) return true;
    const rest = content.slice(match.index + match[0].length);
    if (rest.includes("/>") || rest.includes(`</${name}`)) return true;
  }
  return false;
}

const BLOCK_CODE_RE = /(?:^|\n)[ \t]*(?:```|~~~)|(?:^|\n)(?: {4}|\t)\S/m;

export const RichMessageContent = React.memo(function RichMessageContent({
  content,
  isStreaming,
  feedback,
}: RichMessageContentProps) {
  const [MdxComponent, setMdxComponent] = useState<ComponentType | null>(null);
  const [compileFailure, setCompileFailure] = useState<{
    content: string;
    error: unknown;
  } | null>(null);
  const [highlightLoaded, setHighlightLoaded] = useState<RehypeHighlightPlugin | null>(
    rehypeHighlightPlugin
  );
  const hasJsx = containsJsxElement(content);
  const needsHighlight = !isStreaming && BLOCK_CODE_RE.test(content);

  useEffect(() => {
    if (!needsHighlight || rehypeHighlightPlugin) return;
    void getRehypeHighlight().then(setHighlightLoaded);
  }, [needsHighlight]);

  useEffect(() => {
    if (isStreaming || !hasJsx) {
      setMdxComponent(null);
      setCompileFailure(null);
      return;
    }
    if (needsHighlight && !highlightLoaded) return;

    let cancelled = false;
    compileMdx(content, highlightLoaded)
      .then((Component) => {
        if (!cancelled) {
          setCompileFailure(null);
          setMdxComponent(() => Component);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.debug("MDX compilation failed, using markdown fallback:", error);
          setMdxComponent(null);
          setCompileFailure({ content, error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, hasJsx, highlightLoaded, isStreaming, needsHighlight]);

  if (MdxComponent) {
    return (
      <MdxRenderErrorBoundary
        key={content}
        renderFallback={(error) => (
          <>
            <MdxFailureReporter
              feedback={feedback}
              content={content}
              category="render_failed"
              error={error}
            />
            <PlainTextMessageContent content={content} />
          </>
        )}
      >
        <div className="message-prose">
          {feedback ? (
            <ResponseProblemFeedback
              chat={feedback.chat}
              author={feedback.author}
              refs={{ messageId: feedback.messageId as never }}
              scope={`mdx:${feedback.messageId}:${contentFingerprint(content)}`}
            >
              <MdxComponent />
            </ResponseProblemFeedback>
          ) : (
            <MdxComponent />
          )}
        </div>
      </MdxRenderErrorBoundary>
    );
  }

  const rehypePlugins =
    !isStreaming && highlightLoaded
      ? ([[highlightLoaded, { ignoreMissing: true }]] as [
          RehypeHighlightPlugin,
          { ignoreMissing: boolean },
        ][])
      : [];

  // Until MDX compilation settles, this Markdown is a placeholder for the
  // component render; observers of the panel wait on this marker.
  const compiling =
    hasJsx && !isStreaming && !(compileFailure && compileFailure.content === content);
  return (
    <div className="message-prose" data-ui-render={compiling ? "pending" : undefined}>
      {compileFailure && compileFailure.content === content && !isStreaming ? (
        <MdxFailureReporter
          feedback={feedback}
          content={content}
          category="compile_failed"
          error={compileFailure.error}
        />
      ) : null}
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={isStreaming ? streamingMarkdownComponents : markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
