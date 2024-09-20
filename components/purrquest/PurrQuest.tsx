import { forwardRef, useEffect, useState, useLayoutEffect, useRef } from "react";
import { StartGame, GAME_HEIGHT, GAME_WIDTH } from "./config";
import { EventBus } from "./EventBus";
import { MobileButtons } from "../Phaser/MobileButtons/MobileButtons";
import { useBackground } from "../catbassadors/hooks";
import { useGameLoadedEvent } from "../catbassadors/hooks";
import { PurrquestBusEvent } from "./PurrquestBus.events";
import { ICat } from "@/models/cats";
import { PixelButton } from "../button/PixelButton";
export interface IRefPhaserGame {
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface IProps {
    currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame(
    { currentActiveScene },
    ref
) {
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

interface IPurrquestProps {
    cat: ICat;
}

const Purrquest = () => {
    const [isGameOver, setIsGameOver] = useState(false);
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const isGameLoaded = useGameLoadedEvent();
    const background = useBackground();

    useEffect(() => {
        EventBus.on("CAT_DIED", () => {
            setIsGameOver(true);
        });

        return () => {
            EventBus.removeListener("CAT_DIED");
        };
    }, [])

    const handleRestart = () => {
        setIsGameOver(false);
        if (phaserRef.current?.game) {
            const currentScene = phaserRef.current.game.scene.getScene("PurrquestScene");
            currentScene.scene.restart();
        }
    };
    const handleReturnToMainMenu = () => {
        console.log("return to main menu")
    }
    return (
        <div style={background} id="app">
            <MobileButtons isHidden={false} />
            <PhaserGame ref={phaserRef} />

            {isGameOver && (
                <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center flex-col bg-black bg-opacity-50 z-50">
                    <div className="text-red-600 lg:text-8xl text-6xl mb-5 text-center  font-extrabold">You Died</div>
                    <div className=" flex justify-center items-center flex-row">
                        <PixelButton
                            text="Restart"
                            onClick={handleRestart}>
                        </PixelButton>
                        <PixelButton
                            text="MainMenu"
                            onClick={handleReturnToMainMenu}>
                        </PixelButton>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Purrquest;
