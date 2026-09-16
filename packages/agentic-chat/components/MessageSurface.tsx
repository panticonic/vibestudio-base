import type { ReactNode } from "react";
import { Card } from "@radix-ui/themes";

/** Message presentation shared by live transcripts and locally composed views. */
export function MessageSurface({
  role,
  secondary = false,
  error = false,
  children,
}: {
  role: "player" | "agent";
  secondary?: boolean;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      className={[
        "message-card",
        role === "player" && "message-card-client",
        error && "message-card-error",
        secondary && "message-card-tier2",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Card>
  );
}
