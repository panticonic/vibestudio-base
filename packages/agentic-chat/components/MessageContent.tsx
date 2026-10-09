import React, { Suspense, lazy, type ReactNode } from "react";
import { Text } from "@radix-ui/themes";
import type { MessageFeedbackTarget } from "./RichMessageContent";

interface MessageContentProps {
  content: string;
  isStreaming: boolean;
  /** Set for agent-authored messages so MDX failures reach their author. */
  feedback?: MessageFeedbackTarget;
}

// Markdown parsing, GFM, MDX, and syntax highlighting are progressive
// enhancements. Keeping them behind a real import boundary lets an empty chat
// (and the very common plain-text message) paint without parsing the markdown
// toolchain first.
const RichMessageContent = lazy(() =>
  import("./RichMessageContent").then((module) => ({
    default: module.RichMessageContent,
  }))
);

// Match syntax that materially benefits from markdown rendering. Bare
// punctuation does not qualify, so ordinary prose stays on the synchronous
// plain-text path.
const MARKDOWN_SYNTAX_RE =
  /^[ \t]*#{1,6} |`[^`]|```|\*\*|__|\*[^\s*]|_[^\s_]|^[ \t]*[-*+] |^[ \t]*\d+\. |^[ \t]*>|~~|\[[^\]]*\]\(|!\[|.*\|.*\|/m;
const GFM_AUTOLINK_LITERAL_RE =
  /(?:https?:\/\/|www\.)[^\s<]+|[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/iu;

function PlainTextMessageContent({
  content,
  pending,
}: {
  content: string;
  /** The rich renderer is still loading; this text is a placeholder for it. */
  pending?: boolean;
}) {
  return (
    <div className="message-prose" data-ui-render={pending ? "pending" : undefined}>
      <Text as="div" size="2" style={{ whiteSpace: "pre-wrap" }}>
        {content}
      </Text>
    </div>
  );
}

class RichRenderErrorBoundary extends React.Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown) {
    console.debug("Rich message renderer failed, using plain text:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function feedbackEqual(
  a: MessageFeedbackTarget | undefined,
  b: MessageFeedbackTarget | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.chat === b.chat &&
    a.messageId === b.messageId &&
    a.turnId === b.turnId &&
    a.author.kind === b.author.kind &&
    a.author.id === b.author.id
  );
}

export const MessageContent = React.memo(
  function MessageContent({
  content,
  isStreaming,
  feedback,
}: MessageContentProps) {
  const needsRichRenderer =
    /<[A-Z]/.test(content) ||
    /^(?:import|export)\s/m.test(content) ||
    MARKDOWN_SYNTAX_RE.test(content) ||
    (!isStreaming && GFM_AUTOLINK_LITERAL_RE.test(content));
  if (!needsRichRenderer) {
    return <PlainTextMessageContent content={content} />;
  }

  const fallback = <PlainTextMessageContent content={content} />;
  return (
    <RichRenderErrorBoundary fallback={fallback} resetKey={content}>
      <Suspense fallback={<PlainTextMessageContent content={content} pending />}>
        <RichMessageContent
          content={content}
          isStreaming={isStreaming}
          feedback={feedback}
        />
      </Suspense>
    </RichRenderErrorBoundary>
  );
},
  (previous, next) =>
    previous.content === next.content &&
    previous.isStreaming === next.isStreaming &&
    feedbackEqual(previous.feedback, next.feedback),
);
