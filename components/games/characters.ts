import kaboom from "kaboom";

export const playerAttributes = {
    JUMP_FORCE: 1320,
    // JUMP_FORCE: 3000,
    // MOVE_SPEED: 700,
    MOVE_SPEED: 800,
    // FALL_DEATH: 2400,
};

export function initPlayer(k: ReturnType<typeof kaboom>) {
    const player = k.add([
        k.sprite("cat", { anim: "idle" }),
        k.area({
            shape: new k.Rect(k.vec2(0, 0), 33, 33),
        }),
        k.scale(2),
        k.anchor("center"),
        // k.pos(0, 0),
        // k.pos(3000, 2752),
        k.pos(5000, 3900), // spawn near the door
        // k.pos(500, 100), // spawn near the key
        k.body(),
        "player",
    ]);

    return player;
}

export function initNPC(k: ReturnType<typeof kaboom>) {
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

    return NPC;
}
