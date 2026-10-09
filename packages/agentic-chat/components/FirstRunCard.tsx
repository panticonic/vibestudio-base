import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import { ChatBubbleIcon } from "@radix-ui/react-icons";

/**
 * First-run card, shown as the empty-transcript state of a brand-new,
 * model-ready chat. Model discovery and explicit setup have their own
 * surfaces, so this card must never imply setup is still needed. It
 * disappears the moment the first message lands.
 */
export function FirstRunCard() {
  return (
    <Flex align="center" justify="center" style={{ height: "100%", padding: 24 }}>
      <Card size="3" style={{ maxWidth: 460, width: "100%" }}>
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <ChatBubbleIcon width="18" height="18" />
            <Heading size="4">Start a conversation</Heading>
          </Flex>
          <Text size="2" color="gray">
            Send a message below and your agent will start automatically. You can switch models
            from the model picker at any time.
          </Text>
          <Text size="1" color="gray">
            Tip: type @ to mention an agent, / for commands, or paste an image.
          </Text>
        </Flex>
      </Card>
    </Flex>
  );
}
