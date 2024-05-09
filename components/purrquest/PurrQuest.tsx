import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { StartGame, GAME_HEIGHT, GAME_WIDTH } from "./config";
import { EventBus } from "./EventBus";

export interface IRefPhaserGame {
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface IProps {
    currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref) {
    const game = useRef<Phaser.Game | null>(null!);

    useLayoutEffect(() => {
        if (game.current === null) {
            game.current = StartGame("game-container", GAME_WIDTH, GAME_HEIGHT);

            if (typeof ref === "function") {
                ref({ game: game.current, scene: null });
            } else if (ref) {
                ref.current = { game: game.current, scene: null };
            }
        }

        return () => {
            if (game.current) {
                game.current.destroy(true);
                if (game.current !== null) {
                    game.current = null;
                }
            }
        };
    }, [ref]);

    useEffect(() => {
        EventBus.on("current-scene-ready", (scene_instance: Phaser.Scene) => {
            if (currentActiveScene && typeof currentActiveScene === "function") {
                currentActiveScene(scene_instance);
            }

            if (typeof ref === "function") {
                ref({ game: game.current, scene: scene_instance });
            } else if (ref) {
                ref.current = {
                    game: game.current,
                    scene: scene_instance,
                };
            }
        });
        return () => {
            EventBus.removeListener("current-scene-ready");
        };
    }, [currentActiveScene, ref]);

    return <div id="game-container"></div>;
});

function PurrQuest() {
    // The sprite can only be moved in the MainMenu Scene
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
        </div>
    );
}

export default PurrQuest;
