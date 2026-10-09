// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/runtime", () => ({ images: {} }));
import { Image, Video, mediaUrl, youtubeSource } from "./media.js";

describe("shared conversation media", () => {
  it("normalizes YouTube sources and times without contacting third parties", () => {
    expect(youtubeSource("https://youtu.be/Pb6C4ORBOOI?t=1m20s")).toEqual({
      id: "Pb6C4ORBOOI",
      start: 80,
    });
    expect(
      youtubeSource("https://www.youtube.com/watch?v=Pb6C4ORBOOI"),
    ).toEqual({ id: "Pb6C4ORBOOI", start: 0 });
    expect(
      youtubeSource("https://www.youtube-nocookie.com/embed/Pb6C4ORBOOI"),
    ).toEqual({ id: "Pb6C4ORBOOI", start: 0 });
    expect(
      youtubeSource("https://youtube.com.evil.example/video.mp4"),
    ).toBeNull();
    expect(() => mediaUrl("file:///private/video.mp4")).toThrow();
    expect(() => mediaUrl("javascript:alert(1)")).toThrow();
    expect(() => mediaUrl("https://secret@example.com/video.mp4")).toThrow();
    expect(mediaUrl("./assets/intro.mp4")).toBe("./assets/intro.mp4");
    expect(mediaUrl("data:video/mp4;base64,AAAA")).toBe(
      "data:video/mp4;base64,AAAA",
    );
    expect(mediaUrl("data:text/vtt,WEBVTT")).toBe("data:text/vtt,WEBVTT");
    expect(() =>
      mediaUrl("data:text/html,<script>alert(1)</script>"),
    ).toThrow();
  });
  it("lets Chromium defer hidden YouTube players, preserves a watch link, and retires playback on source change", () => {
    const { container, rerender } = render(
      <Video url="https://youtu.be/Pb6C4ORBOOI" title="Introduction" />,
    );
    const initialPlayer = container.querySelector("iframe")!;
    expect(initialPlayer).toBeTruthy();
    expect(initialPlayer.getAttribute("loading")).toBe("lazy");
    expect(initialPlayer.getAttribute("allow")?.split("; ")).toContain("fullscreen");
    expect(initialPlayer.hasAttribute("allowfullscreen")).toBe(false);
    expect(new URL(initialPlayer.src).searchParams.get("autoplay")).not.toBe("1");
    expect(
      screen
        .getByRole("link", { name: "Watch on YouTube" })
        .getAttribute("href"),
    ).toContain("Pb6C4ORBOOI");
    expect(screen.queryByRole("button", { name: /Load video/ })).toBeNull();
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain(
      "youtube-nocookie.com/embed/",
    );
    expect(
      container.querySelector("iframe")?.getAttribute("referrerpolicy"),
    ).toBe("strict-origin-when-cross-origin");
    rerender(
      <Video url="https://youtu.be/M7lc1UVf-VE" title="Another video" />,
    );
    expect(container.querySelector("iframe")).not.toBe(initialPlayer);
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("M7lc1UVf-VE");
  });
  it("offers native playback and surfaces actual playback failure", () => {
    const { container } = render(
      <Video
        url="./assets/intro.mp4"
        title="Local intro"
        captionsUrl="./assets/intro.vtt"
      />,
    );
    const player = container.querySelector("video")!;
    expect(player.controls).toBe(true);
    expect(player.autoplay).toBe(false);
    expect(player.crossOrigin).toBe("anonymous");
    fireEvent.error(player.querySelector("track")!);
    expect(screen.getByRole("alert").textContent).toContain(
      "Captions could not be loaded",
    );
    fireEvent.error(player);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be played",
    );
  });
  it("shows an image immediately and reports unavailable sources", () => {
    const { container } = render(
      <Image src="https://example.com/result.png" alt="Generated result" />,
    );
    expect(
      screen.getByRole("button", { name: "Enlarge Generated result" }),
    ).toBeTruthy();
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByRole("alert").textContent).toContain("unavailable");
  });
});
