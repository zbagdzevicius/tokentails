import { Game } from "phaser";
import { CatnipChaosScene, ICatnipChaosProps } from "./scenes/CatnipChaos";
import { useLayoutEffect, useRef } from "react";

const catImages: Record<number, string> = {
  101: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/EGGY/base.png",
  102: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/SABLE/base.png",
  103: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/CHARMIE/base.png",
  104: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/NOELLE/base.png",
  105: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/LAVA/base.png",
  106: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/TROUFAS/base.png",
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
  const game = new Game({
    ...config,
    parent: "game-container",
    width: window.innerWidth,
    height: window.innerHeight,
  });
  game.scene.start("CatnipChaosScene", props);
  return game;
};

const getImageForLevel = (level: number): string => {
  return level.toString().startsWith("8")
    ? "currency/SEI.webp"
    : "catnip-chaos/items/catnip-coin.png";
};

const getCatForLevel = (level: number): string | undefined => {
  if (catImages[level]) return catImages[level];
  return level.toString().startsWith("10")
    ? "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/santa.png"
    : undefined;
};

const CatnipChaosGame = ({ level }: { level: string }) => {
  const game = useRef<Phaser.Game | null>(null!);
  const coinImage = getImageForLevel(parseInt(level, 10));
  const ghostImage = getCatForLevel(parseInt(level, 10)) ?? "";

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame({ level, coinImage, ghostImage });
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
