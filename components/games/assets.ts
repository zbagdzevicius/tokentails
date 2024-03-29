export const loadGameAssets = (k: any) => {
    k.loadSprite("cat", "/cats/black/sprite/combined.png", {
        sliceX: 29,
        sliceY: 1,
        anims: {
            width: 1864,
            height: 66,
            run: {
                from: 0,
                to: 6,
                loop: true,
            },
            jump: {
                from: 1,
                to: 4,
                loop: false,
            },
            idle: {
                from: 7,
                to: 21,
                loop: true,
            },
        },
    });
    k.loadSprite("background", "/images/home-page/bg-1.jpg");
    // k.loadSprite("ghosty", "purrquest/sprites/ghosty.png");
    // k.loadSprite("spike", "purrquest/sprites/spike.png");
    k.loadSprite("grass", "purrquest/sprites/grass.png");
    // k.loadSprite("prize", "purrquest/sprites/jumpy.png");
    // k.loadSprite("apple", "purrquest/sprites/apple.png");
    k.loadSprite("portal", "purrquest/sprites/portal.png");
    k.loadSprite("coin", "purrquest/sprites/coin.png");
    k.loadSprite("trampoline", "purrquest/sprites/trampoline.png");
    k.loadSprite("steel", "purrquest/sprites/steel.png");
    k.loadSprite("key", "purrquest/sprites/key.png");
    k.loadSound("coin", "purrquest/sounds/score.mp3");
    k.loadSound("powerup", "purrquest/sounds/powerup.mp3");
    k.loadSound("blip", "purrquest/sounds/blip.mp3");
    // k.loadSound("hit", "purrquest/sounds/hit.mp3");
    k.loadSound("portal", "purrquest/sounds/portal.mp3");
};

export function addBackground(k: any) {
    const bgWidth = 1024;
    const bgHeight = 1024;

    const scaleX = window.innerWidth / bgWidth;
    const scaleY = window.innerHeight / bgHeight;
    const scale = Math.max(scaleX, scaleY);

    // Calculate centered position
    const x = (window.innerWidth - bgWidth * scale) / 2;
    const y = (window.innerHeight - bgHeight * scale) / 2;

    k.add([k.sprite("background"), k.pos(k.vec2(x, y)), k.scale(k.vec2(scale)), k.fixed()]);
}
