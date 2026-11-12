import { useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { usePanelTheme } from "@workspace/react/theme";
import "@workspace/natlang/dashboard/style.css";
import { mountDashboard, type MountedDashboard } from "./src/dashboard.js";
import { createRuntimePorts } from "./src/runtimePorts.js";

/**
 * Natlang: natlang's own dashboard pages (programs, runs, traces, playground) mounted over Vibestudio's services. The
 * pages are vanilla DOM modules, so React only owns the element they mount into.
 */
function NatlangApp() {
  const host = useRef<HTMLDivElement>(null);
  const dashboard = useRef<MountedDashboard | null>(null);
  const theme = usePanelTheme();
  const ports = useMemo(createRuntimePorts, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    dashboard.current = mountDashboard(element, ports, { theme });
    return () => {
      dashboard.current?.dispose();
      dashboard.current = null;
    };
    // The dashboard follows the theme through the element's attribute below, not by remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports]);

  useEffect(() => {
    host.current?.setAttribute("data-theme", theme);
  }, [theme]);

  return <div ref={host} style={{ minHeight: "100dvh" }} />;
}

const root = createRoot(
  document.getElementById("root") ?? document.body.appendChild(document.createElement("div"))
);
root.render(<NatlangApp />);
