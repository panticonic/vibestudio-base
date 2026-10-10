// @vitest-environment jsdom

import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParticipantBadgeMenu } from "./ParticipantBadgeMenu";

// AgentDialog (rendered for agent participants) reads ChatContext; stub it so the
// badge can be tested in isolation without a full <ChatProvider>.
vi.mock("./AgentDialog", () => ({ AgentDialog: () => null }));

describe("ParticipantBadgeMenu — presence", () => {
  it("shows durable presence directly on a canonical human badge", () => {
    render(
      <Theme>
        <ParticipantBadgeMenu
          participant={{
            id: "user:usr_alice",
            ref: {
              kind: "user",
              id: "user:usr_alice",
              participantId: "user:usr_alice",
            },
            metadata: { name: "Workspace member", type: "user" },
          }}
          profile={{
            userId: "usr_alice",
            handle: "alice",
            displayName: "Alice",
            role: "member",
          }}
          presenceStatus="idle"
          hasActiveMessage={false}
          onCallMethod={vi.fn()}
        />
      </Theme>,
    );
    expect(screen.getByText(/@alice/)).toBeTruthy();
    expect(screen.getByLabelText("idle")).toBeTruthy();
    expect(screen.getByTitle("Alice — idle")).toBeTruthy();
  });
});
