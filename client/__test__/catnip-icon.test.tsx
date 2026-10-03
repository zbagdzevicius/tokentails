/**
 * @jest-environment jsdom
 */
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import {
  CATNIP_ICON_FILES,
  CATNIP_ICON_SIZES,
  CatnipIcon,
  catnipIconSrcSet,
} from "@/components/shared/CatnipIcon";

describe("CatnipIcon (plan G8)", () => {
  it.each(CATNIP_ICON_SIZES)("size %i has an exact 1x/2x/3x srcSet from /catnip/catnip-v2-{px}.png", (size) => {
    render(<CatnipIcon size={size} />);
    const img = screen.getByRole("img", { name: "Catnip" });
    expect(img.getAttribute("src")).toBe(`/catnip/catnip-v2-${size}.png`);
    expect(img.getAttribute("srcset")).toBe(
      `/catnip/catnip-v2-${size}.png 1x, /catnip/catnip-v2-${size * 2}.png 2x, /catnip/catnip-v2-${size * 3}.png 3x`,
    );
    expect(img.getAttribute("width")).toBe(String(size));
    expect(img.getAttribute("height")).toBe(String(size));
    // Fixed CSS px so every density maps 1:1 onto the file's pixels.
    expect(img.style.width).toBe(`${size}px`);
    expect(img.style.height).toBe(`${size}px`);
  });

  it("defaults the alt text to Catnip and is exposed as an image", () => {
    render(<CatnipIcon size={24} />);
    const img = screen.getByAltText("Catnip");
    expect(img.getAttribute("aria-hidden")).toBeNull();
  });

  it("alt='' makes it decorative: empty alt and hidden from assistive tech", () => {
    const { container } = render(<CatnipIcon size={16} alt="" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps a custom alt and the caller's classes, and never uses .pixelated", () => {
    const { container } = render(<CatnipIcon size={32} alt="Catnip reward" className="mr-2" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Catnip reward");
    expect(img.className).toContain("mr-2");
    expect(img.className).not.toContain("pixelated");
    expect(img.style.imageRendering).toBe("");
  });

  it("serves every file locally (never the CDN) and lists exactly what it can request", () => {
    const fromSrcSets = new Set(
      CATNIP_ICON_SIZES.flatMap((s) => catnipIconSrcSet(s).split(", ").map((entry) => entry.split(" ")[0])),
    );
    expect(new Set(CATNIP_ICON_FILES)).toEqual(fromSrcSets);
    CATNIP_ICON_FILES.forEach((f) => expect(f.startsWith("/catnip/")).toBe(true));
    expect(CATNIP_ICON_FILES).toEqual([
      "/catnip/catnip-v2-16.png",
      "/catnip/catnip-v2-24.png",
      "/catnip/catnip-v2-32.png",
      "/catnip/catnip-v2-48.png",
      "/catnip/catnip-v2-64.png",
      "/catnip/catnip-v2-72.png",
      "/catnip/catnip-v2-96.png",
      "/catnip/catnip-v2-128.png",
      "/catnip/catnip-v2-144.png",
      "/catnip/catnip-v2-192.png",
      "/catnip/catnip-v2-288.png",
    ]);
  });

  it("every requested file exists in client/public at exactly its named pixel size", () => {
    CATNIP_ICON_FILES.forEach((f) => {
      const abs = path.join(__dirname, "..", "public", f);
      expect(fs.existsSync(abs)).toBe(true);
      const png = fs.readFileSync(abs);
      // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
      const px = Number(/catnip-v2-(\d+)\.png$/.exec(f)![1]);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([px, px]);
    });
  });

  it("no DOM site in task 3d's files still points at the legacy cannabis-leaf raster", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      "components/catbassadors/GameStatsSection.tsx",
      "components/shared/ProfileModal.tsx",
      "components/shared/EndGameModal.tsx",
      "components/shared/GameSelectModal.tsx",
    ];
    files.forEach((f) => {
      const text = fs.readFileSync(path.join(root, f), "utf8");
      expect(text).not.toMatch(/logo\/catnip\.webp/);
      expect(text).toMatch(/<CatnipIcon\b/);
    });
  });
});
