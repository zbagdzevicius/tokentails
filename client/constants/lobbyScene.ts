/**
 * The lobby scene: the landing hero layers (landing/hero-bg + landing/hero-ground, both
 * 2752x1536) cover-fit to the viewport. The lobby cat stands on the stone altar painted into
 * hero-ground, so the scene geometry lives here once: the background position (hooks.ts) and the
 * lobby layout (components/game/lobbyLayout.ts) both read it, and the cat cannot drift off the altar.
 */
export const LOBBY_SCENE = {
  /** Source image size in px (both layers). */
  width: 2752,
  height: 1536,
  /** The glowing rune circle on the altar, as fractions of the image (measured on hero-ground). */
  circle: { x: 0.5087, y: 0.7376, rx: 0.1145, ry: 0.03 },
  /** The altar slab's back (top) edge, as a fraction of the image height. */
  slabTop: 0.69,
} as const;

const ASPECT_VH = ((LOBBY_SCENE.width / LOBBY_SCENE.height) * 100).toFixed(4);
/**
 * How much wider than the viewport the image must be for the circle to sit exactly at the
 * viewport's centre without the image leaving a gap at its right edge: 1 / (2 * (1 - circle.x)).
 */
const CENTRE_ZOOM = 1 / (2 * (1 - LOBBY_SCENE.circle.x));
const CENTRE_ZOOM_VW = (CENTRE_ZOOM * 100).toFixed(4);
/**
 * The image width in CSS: a cover fit, zoomed by at most ~1.8% when the screen is so wide that a
 * plain cover fit has no room to shift sideways. The circle then always lands at the screen centre.
 */
const COVER_WIDTH = `max(${CENTRE_ZOOM_VW}vw, ${ASPECT_VH}vh)`;

/** `background-size` for both scene layers (the height follows the aspect ratio). */
export const LOBBY_BG_SIZE = `${COVER_WIDTH} auto`;

/**
 * Centred on the rune circle instead of the image centre (the circle sits 0.87% right of it).
 * Vertically the image is anchored at its bottom edge: most screens are height-bound and see the
 * whole height anyway, and on wide, short ones (landscape phones) the crop then comes off the sky,
 * not off the altar steps, so the PLAY row keeps room under the circle. Mirrors `lobbyStage()`.
 */
export const LOBBY_BG_POSITION = `calc(50vw - ${LOBBY_SCENE.circle.x} * ${COVER_WIDTH}) bottom`;

export interface LobbyStage {
  /** Cover-fit image size and offset in CSS px. */
  imageWidth: number;
  imageHeight: number;
  left: number;
  top: number;
  /** The top edge of the altar slab the circle is carved into, CSS px. */
  slabTop: number;
  /** The rune circle: centre and radii in CSS px. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Where the scene image, and its rune circle, land in a `width` x `height` viewport. */
export function lobbyStage(width: number, height: number): LobbyStage {
  const s = Math.max((width * CENTRE_ZOOM) / LOBBY_SCENE.width, height / LOBBY_SCENE.height);
  const imageWidth = LOBBY_SCENE.width * s;
  const imageHeight = LOBBY_SCENE.height * s;
  const left = width / 2 - LOBBY_SCENE.circle.x * imageWidth;
  // Bottom-anchored (LOBBY_BG_POSITION).
  const top = height - imageHeight;
  const { circle } = LOBBY_SCENE;
  return {
    imageWidth,
    imageHeight,
    left,
    top,
    slabTop: top + LOBBY_SCENE.slabTop * imageHeight,
    cx: left + circle.x * imageWidth,
    cy: top + circle.y * imageHeight,
    rx: circle.rx * imageWidth,
    ry: circle.ry * imageHeight,
  };
}
