import { Game } from "phaser";
import { useLayoutEffect, useRef } from "react";
import { Match3LevelId } from "./match3.config";
import { IMatch3Props, Match3Scene } from "./scenes/Match3Scene";

const MATCH3_PARENT_ID = "match3-game-container";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: MATCH3_PARENT_ID,
  transparent: true,
  pixelArt: true,
  roundPixels: true,
  scene: Match3Scene,
};

export const StartGame = (props: IMatch3Props) => {
  const game = new Game({
    ...config,
    parent: MATCH3_PARENT_ID,
    width: window.innerWidth,
    height: window.innerHeight,
  });

  game.scene.start("Match3Scene", props);
  return game;
};

const Match3Game = ({
  level,
  bestScore,
}: {
  level: Match3LevelId;
  bestScore?: number;
}) => {
  const game = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    if (!game.current) {
      game.current = StartGame({ level, bestScore });
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        game.current = null;
      }
    };
  }, [level, bestScore]);

  return <div id={MATCH3_PARENT_ID} className="h-full w-full animate-opacity" />;
};

export default Match3Game;
