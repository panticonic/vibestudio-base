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

function themeColor(parent: HTMLElement, value: string): string {
  const sample = document.createElement("span");
  sample.style.backgroundColor = value;
  parent.append(sample);
  const color = getComputedStyle(sample).backgroundColor;
  sample.remove();
  return color;
}

function luminance(color: string): number {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const channels = [...context.getImageData(0, 0, 1, 1).data]
    .slice(0, 3)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("chat surface hierarchy", () => {
  for (const appearance of ["light", "dark"] as const) {
    for (const width of [390, 926]) {
      it(`preserves readable themed surface hierarchy in ${appearance} mode at ${width}px`, async () => {
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
                    <Text data-testid="secondary-metadata">
                      Supporting detail
                    </Text>
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
              <div
                className="expanded-thinking"
                data-testid="expanded-thinking"
              />
              <Button variant="soft" data-testid="enabled-soft-button">
                Action
              </Button>
              <Button
                variant="soft"
                disabled
                data-testid="disabled-soft-button"
              >
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
        const expandedThinkingColor =
          getComputedStyle(expandedThinking).backgroundColor;
        const toolColor = paintedCardColor(tool!);
        const enabledSoftButtonColor =
          getComputedStyle(enabledSoftButton).backgroundColor;
        const disabledSoftButtonColor =
          getComputedStyle(disabledSoftButton).backgroundColor;
        expect(getComputedStyle(secondaryProse).fontSize).toBe("14px");
        expect(getComputedStyle(secondaryProse).color).toBe(
          getComputedStyle(transcript).color,
        );
        const mutedToken = document.createElement("span");
        mutedToken.style.color = "var(--gray-11)";
        transcript.append(mutedToken);
        expect(getComputedStyle(secondaryMetadata).color).toBe(
          getComputedStyle(mutedToken).color,
        );
        expect(getComputedStyle(secondaryMetadata).color).not.toBe(
          getComputedStyle(secondaryProse).color,
        );
        mutedToken.remove();
        expect(enabledSoftButtonColor).not.toBe(disabledSoftButtonColor);
        expect(secondaryAgentColor).not.toBe(transcriptColor);
        expect(secondaryPlayerColor).not.toBe(transcriptColor);
        expect(getComputedStyle(secondaryAgent, "::after").boxShadow).not.toBe(
          "none",
        );
        expect(getComputedStyle(secondaryPlayer, "::after").boxShadow).not.toBe(
          "none",
        );

        // The shipped theme owns the palette. Verify readable, distinct
        // semantic surfaces rather than pinning a previous theme's RGB values.
        expect(transcriptColor).toBe(
          themeColor(
            transcript,
            `var(--gray-${appearance === "light" ? 3 : 1})`,
          ),
        );
        expect(agentColor).toBe(
          themeColor(
            transcript,
            appearance === "light"
              ? "var(--color-panel-solid)"
              : "var(--gray-3)",
          ),
        );
        expect(playerColor).not.toBe(agentColor);
        expect(secondaryPlayerColor).toBe(playerColor);
        expect(secondaryErrorColor).not.toBe(secondaryAgentColor);
        expect(toolColor).toBe(
          themeColor(
            transcript,
            appearance === "light"
              ? "var(--tool-surface-blue-background)"
              : "var(--gray-2)",
          ),
        );
        expect(
          contrast(getComputedStyle(secondaryProse).color, secondaryAgentColor),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(
            getComputedStyle(secondaryMetadata).color,
            secondaryAgentColor,
          ),
        ).toBeGreaterThanOrEqual(4.5);
        if (appearance === "light") {
          expect(playerColor).toBe(themeColor(transcript, "var(--accent-3)"));
          expect(expandedThinkingColor).toBe(
            themeColor(transcript, "var(--gray-2)"),
          );
        } else {
          expect(secondaryAgentColor).toBe(
            themeColor(transcript, "var(--gray-2)"),
          );
          expect(getComputedStyle(tool!).borderTopColor).not.toBe(
            getComputedStyle(agent).borderTopColor,
          );
        }
      });
    }
  }
});
