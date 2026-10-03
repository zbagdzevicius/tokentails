import { Game } from "phaser";
import { makeGameConfig } from "@/components/Phaser/look/makeGameConfig";
import { registerGame } from "@/lib/game/gameRegistry";
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
  // F10: backing store at CSS size x capped dpr, zoom 1 / dpr, resize-aware.
  const game = new Game(makeGameConfig({ ...config, parent: MATCH3_PARENT_ID }));

  registerGame(game);
  game.scene.start("Match3Scene", props);
  return game;
};

const Match3Game = ({
  level,
  bestScore,
  isRestart,
  levelCleared,
}: {
  level: Match3LevelId;
  bestScore?: number;
  isRestart?: boolean;
  levelCleared?: boolean;
}) => {
  const game = useRef<Phaser.Game | null>(null);
  // Read once, when the run starts: a restart flag or a clear that changes mid-run must not
  // recreate the game (the effect below keys on the level and best score only).
  const startProps = useRef({ isRestart, levelCleared });

  useLayoutEffect(() => {
    if (!game.current) {
      game.current = StartGame({ level, bestScore, ...startProps.current });
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        game.current = null;
      }
    };
  }, [level, bestScore]);

  return <div id={MATCH3_PARENT_ID} className="h-full w-full" />;
};

export default Match3Game;
