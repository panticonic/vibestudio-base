import type { ReactNode } from "react";
import { ComponentInstanceIcon } from "@radix-ui/react-icons";
import { SurfaceFrame } from "@workspace/tool-ui/components/SurfaceFrame";

/** The inline UI frame, independent of compilation, channel state and persistence. */
export function InlineUiSurface({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <SurfaceFrame
      className="inline-ui-frame"
      title="Interactive UI"
      subtitle={subtitle}
      tone="blue"
      icon={<ComponentInstanceIcon />}
      collapsible
      defaultExpanded
    >
      {children}
    </SurfaceFrame>
  );
}
