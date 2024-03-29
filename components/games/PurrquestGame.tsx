import kaboom from "kaboom";
import { useEffect, useRef } from "react";
import { addControls, loadControls } from "./controls";
import { LEVELS } from "./levels";
import { loadGameAssets, addBackground } from "./assets";

export const PurrquestGame = () => {
    const canvasRef = useRef(null);
    // just make sure this is only run once on mount so your game state is not messed up
    //   @ts-ignroe
    useEffect(() => {
        const k = kaboom({
            width: window.innerWidth,
            height: window.innerHeight,

            // if you don't want to import to the global namespace
            global: false,
            // if you don't want kaboom to create a canvas and insert under document.body
            canvas: canvasRef.current || undefined,
        });

        // define some constants
        const JUMP_FORCE = 1320;
        // const JUMP_FORCE = 3000;
        const MOVE_SPEED = 700;
        // const MOVE_SPEED = 1500;
        // const FALL_DEATH = 2400;
        k.setGravity(3200);

        // enable debug mode
        // k.debug.inspect = true;

        loadControls(k);

        let keyState = { hasKey: false };
        let doorState = { isOpen: false };

        function openDoors(doorState: any) {
            return {
                id: "doors",
                require: ["pos", "area"],
                update() {
                    if (doorState.isOpen) {
                        (this as any).move(0, -30);

                        if ((this as any).pos.y <= 3840) {
                            (this as any).pos.y = 3840;
                            doorState.isOpen = false;
                        }
                    }
                },
            };
        }

        // define what each symbol means in the level graph
        const levelConf = {
            tileWidth: 64,
            tileHeight: 64,
            tiles: {
                "□": () => [
                    k.sprite("grass"),
                    k.area(),
                    k.body({ isStatic: true }),
                    k.anchor("bot"),
                    k.offscreen({ hide: true }),
                    "platform",
                ],
                "-": () => [
                    k.sprite("steel"),
                    k.area(),
                    k.body({ isStatic: true }),
                    k.offscreen({ hide: true }),
                    k.anchor("bot"),
                    openDoors(doorState),
                ],
                T: () => [
                    k.sprite("trampoline"),
                    k.area(),
                    k.body({ isStatic: true }),
                    k.anchor("bot"),
                    k.offscreen({ hide: true }),
                    "trampoline",
                ],
                K: () => [k.sprite("key"), k.area(), k.body(), k.anchor("bot"), k.offscreen({ hide: true }), "key"],
                $: () => [
                    k.sprite("coin"),
                    k.area(),
                    k.pos(0, -9),
                    k.anchor("bot"),
                    k.offscreen({ hide: true }),
                    "coin",
                ],
            },
        };

        k.scene("game", ({ levelId, coins } = { levelId: 0, coins: 0 }) => {
            addBackground(k);
            loadGameAssets(k);
            // add level to scene
            const level = k.addLevel(LEVELS[levelId ?? 0], levelConf);
            addControls(k, {
                jump: () => jump(),
                left: () => left(),
                leftEnd: () => leftEnd(),
                right: () => right(),
                rightEnd: () => rightEnd(),
            });

            // define player object
            const player = k.add([
                k.sprite("cat", { anim: "idle" }),
                k.area({
                    shape: new k.Rect(k.vec2(0, 0), 33, 33),
                }),
                k.scale(2),
                k.anchor("center"),
                k.pos(3000, 2752),
                // k.pos(5000, 3900), // spawn near the door
                // k.pos(500, 100), // spawn near the key
                k.body(),
                "player",
            ]);
            // face towards left at the start
            player.flipX = true;

            const NPC = k.add([
                k.sprite("cat", { anim: "run" }),
                k.area({
                    shape: new k.Rect(k.vec2(0, 0), 33, 33),
                }),
                k.scale(2),
                k.anchor("center"),
                k.pos(6000, 4000),
                k.state("panic", ["idle", "panic"]),
                k.body(),
                "NPC",
            ]);
            // NPC running in circles at the start of the game
            NPC.use(panic(500, 1));

            NPC.onUpdate(() => {
                if (!keyState.hasKey) {
                    triggerEncounterBeforeRescue();
                }
            });

            NPC.onCollide("player", () => {
                triggerEncounterAfterRescue();
            });

            player.onUpdate(() => {
                if (!doorState.isOpen) {
                    checkDistanceBetweenDoors();
                }
                // center camera to player
                k.camPos(player.pos);
                // check fall death
                // if (player.pos.y >= FALL_DEATH) {
                //     k.go("lose");
                // }
            });

            player.onPhysicsResolve(() => {
                // Set the viewport center to player.pos
                k.camPos(player.pos);
            });

            (player as any).onGround((l: any) => {
                if (l.is("trampoline")) {
                    player.jump(JUMP_FORCE * 2);
                    k.play("powerup");
                }
            });

            player.onCollide("key", (a) => {
                k.play("blip");
                k.destroy(a);
                keyState.hasKey = true;

                const portal = k.add([
                    k.sprite("portal"),
                    k.area({ scale: 0.5 }),
                    k.anchor("bot"),
                    k.pos(64, 960),
                    k.offscreen({ hide: true }),
                    "portal",
                ]);
            });

            // teleport near the door
            player.onCollide("portal", () => {
                player.pos = k.vec2(5056, 3904);
            });

            let coinPitch = 0;

            player.onCollide("coin", (c) => {
                k.destroy(c);
                k.play("coin", {
                    detune: coinPitch,
                });
                coinPitch += 100;
                coins += 1;
                coinsLabel.text = coins;
            });

            const coinsLabel = k.add([k.text(coins), k.pos(24, 24), k.fixed()]);

            function panic(speed = 100, dir = 1) {
                return {
                    add() {
                        (this as any).on("collide", (obj: any, col: any) => {
                            if (col.isLeft() || col.isRight()) {
                                dir = -dir;
                                (this as any).flipX = !(this as any).flipX;
                            }
                        });
                    },
                    update() {
                        if ((this as any).state !== "idle") {
                            (this as any).move(speed * dir, 0);
                        }
                    },
                };
            }

            function checkDistanceBetweenDoors() {
                const playerDistance = player.pos.x;
                const doorPositionX = 5440;
                const doorDetectDistance = 64;
                const distance = Math.abs(playerDistance - doorPositionX);

                if (distance < doorDetectDistance && keyState.hasKey && !doorState.isOpen) {
                    doorState.isOpen = true;
                }
            }

            let isDialogueActive = false;

            function showDialogue(content: string) {
                if (isDialogueActive) return;
                isDialogueActive = true;

                const textbox = k.add([
                    k.rect(k.width() - 200, 120, { radius: 32 }),
                    k.anchor("center"),
                    k.pos(player.pos.x, player.pos.y + window.innerHeight / 2.5),
                    k.outline(4),
                ]);

                const txt = k.add([
                    k.text(content, { size: 32, width: k.width() - 230, align: "center" }),
                    k.pos(textbox.pos),
                    k.anchor("center"),
                    k.color(0, 0, 0),
                ]);

                k.onKeyPress(() => {
                    k.destroy(textbox);
                    k.destroy(txt);
                    isDialogueActive = false;
                });
            }

            function triggerEncounterBeforeRescue() {
                const playerDistance = player.pos.x;
                const NPCDistance = NPC.pos.x;

                const distanceBetween = Math.abs(playerDistance - NPCDistance);
                const encounterDistance = 384;

                if (distanceBetween <= encounterDistance && player.pos.y > 3800) {
                    NPC.enterState("idle");
                    NPC.play("idle");
                    player.play("idle");
                    showDialogue("Stepkitten, help me! I am stuck!");
                }
            }

            function triggerEncounterAfterRescue() {
                NPC.flipX = true;
                player.play("idle");
                NPC.enterState("idle");
                NPC.play("idle");
                showDialogue("Thank you for saving me, Stepkitten!");

                // uncomment to end game and trigger winning scene
                // k.wait(5, () => {
                //     k.go("win");
                // });
            }

            function jump() {
                // these 2 functions are provided by body() component
                if (player.isGrounded()) {
                    player.jump(JUMP_FORCE);
                    if (player.curAnim() !== "jump") player.play("jump");
                }
            }

            function right() {
                player.move(MOVE_SPEED, 0);
                if (player.curAnim() !== "run") player.play("run");
                player.flipX = false;
            }
            function left() {
                player.move(-MOVE_SPEED, 0);
                if (player.curAnim() !== "run") player.play("run");
                player.flipX = true;
            }
            function leftEnd() {
                if (player.curAnim() === "run") player.play("idle");
            }

            function rightEnd() {
                if (player.curAnim() === "run") player.play("idle");
            }

            k.onKeyPress("space", jump);
            k.onKeyPress("w", jump);

            k.onKeyDown("left", left);
            k.onKeyDown("a", left);
            k.onKeyRelease("left", leftEnd);

            k.onKeyDown("right", right);
            k.onKeyDown("d", right);
            k.onKeyRelease("right", rightEnd);

            k.onKeyPress("f", () => {
                k.setFullscreen(!k.isFullscreen());
            });
        });

        k.scene("lose", () => {
            k.add([k.text("You Lose")]);
            k.onKeyPress(() => k.go("game"));
        });

        k.scene("win", () => {
            k.add([k.text("You Win")]);
            k.onKeyPress(() => k.go("game"));
        });

        k.go("game");
    }, []);

    return <canvas ref={canvasRef}></canvas>;
};
