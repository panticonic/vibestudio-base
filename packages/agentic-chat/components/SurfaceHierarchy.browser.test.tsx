import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "@vitest/browser/context";
import { Button, Card, Flex, Text, Theme } from "@radix-ui/themes";
import { SurfaceFrame } from "../../tool-ui/src/components/SurfaceFrame";
import "@radix-ui/themes/styles.css";
import "@workspace/ui/foundation.css";
import "@workspace/ui/themes/vibestudio.css";
import "../styles.css";

afterEach(cleanup);

function paintedCardColor(element: Element): string {
  return getComputedStyle(element, "::before").backgroundColor;
}

describe("chat surface hierarchy", () => {
  for (const appearance of ["light", "dark"] as const) {
    for (const width of [390, 926]) {
      it(`keeps product surfaces neutral in ${appearance} mode at ${width}px`, async () => {
        await page.viewport(width, 900);
        render(
          <Theme
            appearance={appearance}
            accentColor="blue"
            grayColor="slate"
            panelBackground="solid"
          >
            <div
              className="agentic-chat-root"
              data-testid="transcript"
              style={{
                display: "grid",
                gap: 12,
                padding: 20,
                width: "100%",
                maxWidth: 760,
              }}
            >
              <Card className="message-card" data-testid="agent-message">
                Agent
              </Card>
              <Card
                className="message-card message-card-client"
                data-testid="player-message"
              >
                Player
              </Card>
              <Card
                className="message-card message-card-tier2"
                data-testid="secondary-agent-message"
              >
                <div className="message-content" data-testid="secondary-prose">
                  Secondary prose
                </div>
                <div className="message-card-body">
                  <Flex>
                    <Text data-testid="secondary-metadata">Supporting detail</Text>
                  </Flex>
                </div>
              </Card>
              <Card
                className="message-card message-card-client message-card-tier2"
                data-testid="secondary-player-message"
              >
                Secondary player prose
              </Card>
              <Card
                className="message-card message-card-tier2 message-card-error"
                data-testid="secondary-error-message"
              >
                Error prose
              </Card>
              <div className="expanded-thinking" data-testid="expanded-thinking" />
              <Button variant="soft" data-testid="enabled-soft-button">
                Action
              </Button>
              <Button variant="soft" disabled data-testid="disabled-soft-button">
                Disabled
              </Button>
              <SurfaceFrame title="Interactive UI" tone="blue">
                Tool content
              </SurfaceFrame>
            </div>
          </Theme>,
        );

        const transcript = screen.getByTestId("transcript");
        const agent = screen.getByTestId("agent-message");
        const player = screen.getByTestId("player-message");
        const secondaryAgent = screen.getByTestId("secondary-agent-message");
        const secondaryPlayer = screen.getByTestId("secondary-player-message");
        const secondaryError = screen.getByTestId("secondary-error-message");
        const expandedThinking = screen.getByTestId("expanded-thinking");
        const secondaryProse = screen.getByTestId("secondary-prose");
        const secondaryMetadata = screen.getByTestId("secondary-metadata");
        const enabledSoftButton = screen.getByTestId("enabled-soft-button");
        const disabledSoftButton = screen.getByTestId("disabled-soft-button");
        const tool = transcript.querySelector('[data-part="tool-surface"]');
        expect(tool).not.toBeNull();

        const transcriptColor = getComputedStyle(transcript).backgroundColor;
        const agentColor = paintedCardColor(agent);
        const playerColor = paintedCardColor(player);
        const secondaryAgentColor = paintedCardColor(secondaryAgent);
        const secondaryPlayerColor = paintedCardColor(secondaryPlayer);
        const secondaryErrorColor = paintedCardColor(secondaryError);
        const expandedThinkingColor = getComputedStyle(expandedThinking).backgroundColor;
        const toolColor = paintedCardColor(tool!);
        const enabledSoftButtonColor = getComputedStyle(enabledSoftButton).backgroundColor;
        const disabledSoftButtonColor = getComputedStyle(disabledSoftButton).backgroundColor;
        expect(getComputedStyle(secondaryProse).fontSize).toBe("14px");
        expect(getComputedStyle(secondaryProse).color).toBe(
          appearance === "light" ? "rgb(20, 36, 61)" : "rgb(244, 245, 246)",
        );
        expect(getComputedStyle(secondaryMetadata).color).toBe(
          appearance === "light" ? "rgb(88, 103, 125)" : "rgb(201, 205, 211)",
        );
        expect(enabledSoftButtonColor).not.toBe(disabledSoftButtonColor);
        expect(secondaryAgentColor).not.toBe(transcriptColor);
        expect(secondaryPlayerColor).not.toBe(transcriptColor);
        expect(getComputedStyle(secondaryAgent, "::after").boxShadow).not.toBe("none");
        expect(getComputedStyle(secondaryPlayer, "::after").boxShadow).not.toBe("none");

        if (appearance === "light") {
          expect(transcriptColor).toBe("rgb(234, 237, 243)");
          expect(agentColor).toBe("rgb(255, 255, 255)");
          expect(playerColor).toBe("rgb(235, 241, 250)");
          expect(playerColor).not.toBe(agentColor);
          expect(secondaryAgentColor).toBe("rgb(241, 243, 247)");
          expect(toolColor).toBe("rgb(241, 243, 247)");
          expect(enabledSoftButtonColor).toBe("rgb(223, 233, 247)");
          expect(secondaryPlayerColor).toBe(playerColor);
          expect(secondaryErrorColor).not.toBe(secondaryAgentColor);
          expect(expandedThinkingColor).toBe("rgb(241, 243, 247)");
        } else {
          expect(transcriptColor).toBe("rgb(32, 33, 36)");
          expect(agentColor).toBe("rgb(52, 55, 60)");
          expect(playerColor).toBe("color(srgb 0.179608 0.208627 0.25549)");
          expect(secondaryAgentColor).toBe("rgb(41, 43, 47)");
          expect(secondaryPlayerColor).toBe(playerColor);
          expect(secondaryErrorColor).not.toBe(secondaryAgentColor);
          expect(toolColor).toBe("rgb(41, 43, 47)");
          expect(getComputedStyle(tool!).borderTopColor).not.toBe(
            getComputedStyle(agent).borderTopColor,
          );
        }
      });
    }
  }
});
