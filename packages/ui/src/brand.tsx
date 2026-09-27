import type { CSSProperties } from "react";
import vibestudioLogo from "./assets/vibestudio-logo.svg";
import vibestudioLogoDark from "./assets/vibestudio-logo-dark.svg";
import vibestudioSymbol from "./assets/vibestudio-symbol.svg";
import vibestudioSymbolDark from "./assets/vibestudio-symbol-dark.svg";
import vibestudioSymbolOnDark from "./assets/vibestudio-symbol-on-dark.svg";
import vibestudioSymbolOnLight from "./assets/vibestudio-symbol-on-light.svg";

export interface VibestudioLogoProps {
  /** Pixel height. The full logo keeps its original 2:3 aspect ratio. */
  size?: number | string;
  /** Full lockup, standalone glyph, or glyph on a theme-aware tile. */
  variant?: "logo" | "symbol" | "tile";
  /** Set to false when the logo should be announced as an image. */
  decorative?: boolean;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

export function VibestudioLogo({
  size = 48,
  variant = "symbol",
  decorative = true,
  alt = "Vibestudio",
  className,
  style,
}: VibestudioLogoProps) {
  const lightSrc = variant === "logo" ? vibestudioLogo : vibestudioSymbol;
  const darkSrc = variant === "logo" ? vibestudioLogoDark : vibestudioSymbolDark;
  const accessibleAlt = decorative ? "" : alt;
  return (
    <span
      className={["vibestudio-logo", `vibestudio-logo-${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      style={{ height: size, aspectRatio: variant === "logo" ? "2 / 3" : "1", ...style }}
      aria-hidden={decorative ? "true" : undefined}
    >
      {variant === "tile" ? (
        <>
          <img
            className="vibestudio-logo-img vibestudio-logo-img-light"
            src={vibestudioSymbolOnLight}
            alt={accessibleAlt}
          />
          <img
            className="vibestudio-logo-img vibestudio-logo-img-dark"
            src={vibestudioSymbolOnDark}
            alt={accessibleAlt}
          />
        </>
      ) : (
        <>
          <img className="vibestudio-logo-img vibestudio-logo-img-light" src={lightSrc} alt={accessibleAlt} />
          <img className="vibestudio-logo-img vibestudio-logo-img-dark" src={darkSrc} alt={accessibleAlt} />
        </>
      )}
    </span>
  );
}
