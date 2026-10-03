import { useEffect, useMemo, useState } from "react";
import { cdnFile } from "./utils";
import { GameType } from "@/models/game";
import { CatnipChaosLevelMap } from "@/components/Phaser/map";
import {
  fetchLookManifest,
  getCachedLookManifest,
  resolveLookVersion,
  type LookManifest,
} from "@/components/Phaser/look/manifest";
import { LOOK_SETTINGS_EVENT } from "@/components/Phaser/look/settings";

const chaptersBackgroundImages = {
  "0": `url(${cdnFile("backgrounds/bg-10.webp")})`,
  "1": `url(${cdnFile("backgrounds/bg-5.webp")})`,
  "2": `url(${cdnFile("backgrounds/bg-6.webp")})`,
  "3": `url(${cdnFile("backgrounds/bg-3.webp")})`,
  "4": `url(${cdnFile("backgrounds/bg-4.webp")})`,
  "5": `url(${cdnFile("backgrounds/bg-1.webp")})`,
  "6": `url(${cdnFile("backgrounds/bg-2.webp")})`,
  "7": `url(${cdnFile("backgrounds/bg-7.webp")})`,
  "8": `url(${cdnFile("backgrounds/bg-8.webp")})`,
  "9": `url(${cdnFile("backgrounds/bg-6.webp")})`,
};

/** The lobby dusk grade, a custom property so the gradient lives in one place (globals.scss). */
export const SKY_DUSK = "var(--tt-sky-dusk)";

/** The night ramp the v1 world modes show until their canvas boots (no poster listed). */
export const SKY_NIGHT =
  "linear-gradient(180deg, rgb(var(--tt-night-950)) 0%, rgb(var(--tt-night-900)) 55%, rgb(var(--tt-night-700)) 100%)";

/** The look manifest scene id of a Phaser world mode, or null for the lobby and Paw Match. */
export function lookSceneId(
  gameType: GameType | null | undefined,
  level: string | null | undefined,
  manifest: Pick<LookManifest, "families"> | null,
): string | null {
  if (gameType === GameType.HOME) return "home";
  if (gameType === GameType.SHELTER) return "shelter";
  if (gameType === GameType.PIXEL_RESCUE) return "cupid";
  if (gameType === GameType.CATNIP_CHAOS) {
    const sheet = level ? CatnipChaosLevelMap[level] : undefined;
    if (!sheet) return null;
    return manifest?.families[sheet] ?? `purrsuit/${sheet.split("/").pop()?.replace(/\.png$/, "")}`;
  }
  return null;
}

/**
 * The look manifest and version for the React side (plan G7, decision #51). Starts from what is
 * already known (override, cached manifest, default) so the first paint never flashes, then
 * follows the manifest fetch and look-setting changes.
 */
export function useLookManifest() {
  const [manifest, setManifest] = useState<LookManifest | null>(() => getCachedLookManifest());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchLookManifest().then((next) => {
      if (alive) setManifest(next);
    });
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener(LOOK_SETTINGS_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(LOOK_SETTINGS_EVENT, onChange);
    };
  }, []);
  // Read on every render (a cheap storage read): `tick` re-renders after a settings change, so a
  // new override shows without a reload.
  void tick;
  const version = resolveLookVersion(manifest);
  return { manifest, version };
}

export const useBackground = ({
  level,
  gameType,
}: {
  level?: string | null;
  gameType?: GameType | null;
}) => {
  const { manifest, version } = useLookManifest();
  /**
   * v1 world modes (G7): the canvas paints the night backdrop itself, so behind it is only a
   * flat night colour plus the scene's poster until boot. Replaces the CSS images and the G6
   * dusk fallback; the Shelter keeps the dusk ramp under its poster.
   */
  const lookBg = useMemo(() => {
    if (version !== "v1") return null;
    const id = lookSceneId(gameType, level, manifest);
    if (!id) return null;
    const scene = manifest?.scenes[id];
    const fallback = gameType === GameType.SHELTER ? SKY_DUSK : SKY_NIGHT;
    return {
      image: scene?.poster ? `url(${scene.poster}), ${fallback}` : fallback,
      color: scene?.background,
    };
  }, [version, gameType, level, manifest]);
  const bgImage = useMemo(() => {
    if (gameType === GameType.HOME) {
      return `url(${cdnFile("backgrounds/bg-2.webp")})`;
    }
    if (gameType === GameType.SHELTER) {
      // Lobby v0 (plan G6): the CSS dusk grade (--tt-sky-dusk in globals.scss: night-to-horizon
      // ramp under a vignette) replaces the hot-pink bg-10.webp. G7 replaces it with the world
      // repaint.
      return SKY_DUSK;
    }
    if (gameType === GameType.MATCH_3) {
      return `url(${cdnFile("landing/game-bg-2.webp")})`;
    }
    return null;
  }, [gameType]);
  const bgHour = useMemo(() => {
    const coreBg = {
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
      backgroundPosition: "center bottom",
      // Behind every scene image, and what shows while it loads: never a gray or white frame.
      backgroundColor: "rgb(var(--tt-night-900))",
    };
    if (lookBg) {
      return {
        ...coreBg,
        backgroundSize: "cover",
        backgroundImage: lookBg.image,
        backgroundColor: lookBg.color ?? coreBg.backgroundColor,
      };
    }
    return {
      ...coreBg,
      backgroundImage: bgImage
        ? bgImage
        : level
        ? chaptersBackgroundImages[
            level[0] as keyof typeof chaptersBackgroundImages
          ]
        : `url(${cdnFile("landing/game-bg-2.webp")})`,
    };
  }, [bgImage, level, lookBg]);

  return bgHour;
};
