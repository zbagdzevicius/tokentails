import { Game } from "phaser";
import { makeGameConfig } from "@/components/Phaser/look/makeGameConfig";
import { registerGame } from "@/lib/game/gameRegistry";
import { CatnipChaosScene, ICatnipChaosProps, type PurrsuitRunOptions } from "./scenes/CatnipChaos";
import { useLayoutEffect, useRef } from "react";
import { cdnFile } from "@/constants/utils";
import { catnipIconSrc } from "@/components/shared/CatnipIcon";

const catImages: Record<number, string> = {
  101: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/EGGY/base.png",
  102: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/SABLE/base.png",
  103: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/CHARMIE/base.png",
  104: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/NOELLE/base.png",
  105: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/LAVA/base.png",
  106: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/TROUFAS/base.png",

  111: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OBI/base.png",
  112: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/ALBUS/base.png",
  113: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/IZZY/base.png",
  114: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MERLOT/base.png",
  115: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PICKLES/base.png",
  116: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OLIVE/base.png",

  121: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RASCAL/base.png",
  122: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FICUS/base.png",
  123: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MILTON/base.png",
  124: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/COCO/base.png",
  125: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/ROY/base.png",
  126: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BOB/base.png",

  131: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MINNIE/base.png",
  132: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/CHESTER/base.png",
  133: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/LADY/base.png",
  134: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/TOM/base.png",
  135: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PORK/base.png",
  136: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/WALLACE/base.png",
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  pixelArt: true,
  roundPixels: true,
  scene: CatnipChaosScene,
  physics: {
    default: "arcade",
    arcade: {
      fps: 240,
      timeScale: 1,
      gravity: { x: 0, y: 600 },
      debug: false,
      tileBias: 32,
      checkCollision: {
        up: true,
        down: true,
        left: true,
        right: true,
      },
      overlapBias: 32,
    },
  },
};

export const StartGame = (props: ICatnipChaosProps) => {
  // F10: backing store at CSS size x capped dpr, zoom 1 / dpr, resize-aware.
  const game = new Game(makeGameConfig({ ...config, parent: "game-container" }));
  registerGame(game);
  game.scene.start("CatnipChaosScene", props);
  return game;
};

/**
 * Full URL of the pickup texture. The catnip sprig is served from the app's own origin
 * (`client/public/catnip/`, same as CatnipIcon) so a deploy never depends on the CDN upload.
 */
const getImageForLevel = (level: number): string => {
  return level.toString().startsWith("8")
    ? cdnFile("currency/SEI.webp")
    : catnipIconSrc(32);
};

const getCatForLevel = (level: number): string | undefined => {
  if (catImages[level]) return catImages[level];
  return level.toString().startsWith("10")
    ? "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/santa.png"
    : undefined;
};

const CatnipChaosGame = ({
  level,
  getRunOptions,
}: {
  level: string;
  /** Read by the scene at every (re)start: Paw Guards and assists for that attempt (plan G10). */
  getRunOptions?: () => PurrsuitRunOptions;
}) => {
  const game = useRef<Phaser.Game | null>(null!);
  const coinImage = getImageForLevel(parseInt(level, 10));
  const ghostImage = getCatForLevel(parseInt(level, 10)) ?? "";

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame({ level, coinImage, ghostImage, getRunOptions });
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, []);

  return <div id="game-container" className="animate-opacity"></div>;
};

export default CatnipChaosGame;
