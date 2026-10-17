/**
 * Today's Pink Paw accomplice (GDD 3.4, 4.6): a real adoptable cat lounging at its spot with a wish bubble that
 * shows the wished prop's icon. When the wish is granted (+500) the bubble turns into a heart and the renderer
 * bursts hearts; a ribbon under the cat names its role: ACCOMPLICE, GUEST STAR or FOUND A HOME (alumni).
 * Render only: 3 draw calls for the cat (fur, outline, face) and 2 sprites.
 */
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type Texture } from 'three';
import { CELL_M, propKind, type AccompliceView } from '../../types';
import { buildCatRig, disposeCatRig, poseCat, type CatRig } from '../cat-rig';
import { angleDelta, cellX, cellZ, levelY } from '../space';

/** A small icon (emoji) per prop slug for the wish bubble; unknown kinds get a gift. */
const PROP_ICON: Readonly<Record<string, string>> = {
  'wine-glass': '🍷', mug: '☕', 'plate-stack': '🍽️', 'fruit-bowl': '🍎', 'egg-carton': '🥚', cake: '🎂', vase: '💐',
  'potted-plant': '🪴', lamp: '💡', 'tv-remote': '📺', laptop: '💻', 'toilet-roll': '🧻', perfume: '🌸', tablecloth: '🧺',
  'book-stack': '📚', ornament: '🎄', 'christmas-tree': '🎄', slipper: '🥿', sock: '🧦', roomba: '🤖', 'tuna-can': '🐟',
  'popcorn-bowl': '🍿', 'yarn-ball': '🧶', 'rubber-duck': '🦆', 'toothbrush-cup': '🪥', 'pen-cup': '🖊️', 'cups-tower': '🥤',
  balloon: '🎈', ribbon: '🎀', 'gift-stack': '🎁', 'punch-bowl': '🍹', 'birthday-candles': '🕯️', 'laundry-basket': '🧺',
  'alarm-clock': '⏰', 'jewellery-dish': '💍', 'cookie-tray': '🍪', 'flour-bag': '🌾', 'mixer-bowl': '🥣', butter: '🧈',
  'board-game': '🎲', 'snack-tower': '🍪', controller: '🎮', dice: '🎲', 'scented-candle': '🕯️', 'face-mask-jar': '🫙',
  'towel-stack': '🧖', 'gravy-boat': '🥣', pie: '🥧', 'turkey-platter': '🍗', 'turkey-leg': '🍗', 'box-tower': '📦',
  'bubble-wrap': '🫧', 'receipt-pile': '🧾', 'cardboard-box': '📦', 'champagne-tower': '🥂', bouquet: '💐', phone: '📱',
  'water-glass': '🥛', blanket: '🛏️', 'snow-globe': '🔮', 'gift-wrap': '🎁', 'champagne-bottle': '🍾', 'sponsor-product': '⭐',
};
export function propIcon(kind: number): string {
  const d = propKind(kind);
  return (d && PROP_ICON[d.id]) || '🎁';
}

const BADGE_TEXT: Readonly<Record<NonNullable<AccompliceView['badge']>, { text: string; fill: string; band: string }>> = {
  accomplice: { text: 'ACCOMPLICE', fill: '#fffaf2', band: '#ff69b4' },
  guest_star: { text: 'GUEST STAR', fill: '#2b1d2e', band: '#ffd166' },
  alumni: { text: 'FOUND A HOME', fill: '#fffaf2', band: '#7bd389' },
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    draw(g);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}

function wishTexture(icon: string, granted: boolean): Texture | null {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = 'rgba(43,29,46,0.25)';
    g.beginPath();
    g.arc(66, 58, 50, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = granted ? '#ffe3ee' : '#fffaf2';
    g.strokeStyle = '#ff69b4';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 54, 46, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // thought-bubble tail dots
    for (const [x, y, r] of [
      [40, 104, 9],
      [28, 120, 5],
    ] as const) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (granted) {
      g.fillStyle = '#ff4d8d';
      g.beginPath();
      g.moveTo(64, 82);
      g.bezierCurveTo(20, 54, 40, 18, 64, 40);
      g.bezierCurveTo(88, 18, 108, 54, 64, 82);
      g.fill();
    } else {
      g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
      g.fillText(icon, 64, 58);
    }
  });
}

function badgeTexture(b: NonNullable<AccompliceView['badge']>, name: string): Texture | null {
  const s = BADGE_TEXT[b];
  return canvasTex(384, 96, (g) => {
    // ribbon with notched ends
    g.fillStyle = s.band;
    g.beginPath();
    g.moveTo(8, 18);
    g.lineTo(376, 18);
    g.lineTo(356, 48);
    g.lineTo(376, 78);
    g.lineTo(8, 78);
    g.lineTo(28, 48);
    g.closePath();
    g.fill();
    g.strokeStyle = '#2b1d2e';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = s.fill;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 30px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.fillText(`${name ? name.toUpperCase() + ' · ' : ''}${s.text}`, 192, 50, 320);
  });
}

export class AccompliceActor {
  rig: CatRig;
  readonly bubble: Sprite;
  readonly badge: Sprite;
  private bubbleMat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  private badgeMat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  private texWish: Texture | null = null;
  private texHeart: Texture | null = null;
  private texBadge: Texture | null = null;
  private granted = false;
  /** Render tick the wish was granted (heart burst), -1 none. */
  grantedT = -1;
  /** True while a clip renders: world labels (the ribbon, the wish bubble) would cover the watermark. */
  hideLabels = false;
  readonly pos = new Vector3();

  constructor(public view: AccompliceView) {
    this.rig = buildCatRig(view.spec, null);
    this.rig.root.name = 'accomplice';
    this.bubble = new Sprite(this.bubbleMat);
    this.bubble.name = 'accomplice-wish';
    this.bubble.renderOrder = 10;
    this.bubble.center.set(0.2, 0);
    this.badge = new Sprite(this.badgeMat);
    this.badge.name = 'accomplice-badge';
    this.badge.renderOrder = 10;
    this.badge.center.set(0.5, 1);
    this.setTextures(view, 0);
  }

  /** Update the view (same cat: textures only; another cat: rebuild the rig, the caller re-adds it). */
  setView(v: AccompliceView, wishKind: number): boolean {
    const rebuilt = JSON.stringify(v.spec) !== JSON.stringify(this.view.spec);
    if (rebuilt) {
      disposeCatRig(this.rig);
      this.rig = buildCatRig(v.spec, null);
      this.rig.root.name = 'accomplice';
    }
    this.view = v;
    this.setTextures(v, wishKind);
    return rebuilt;
  }

  private setTextures(v: AccompliceView, wishKind: number): void {
    this.texWish?.dispose();
    this.texBadge?.dispose();
    this.texWish = v.wishProp >= 0 ? wishTexture(propIcon(wishKind), false) : null;
    if (!this.texHeart) this.texHeart = wishTexture('', true);
    this.texBadge = v.badge ? badgeTexture(v.badge, v.name) : null;
    this.badgeMat.map = this.texBadge;
    this.badgeMat.needsUpdate = true;
    this.granted = false;
    this.applyBubble(v.granted);
  }

  private applyBubble(granted: boolean): void {
    this.bubbleMat.map = granted ? this.texHeart : this.texWish;
    this.bubbleMat.needsUpdate = true;
  }

  /** wishProp: world position of the wished prop (the cat looks at it), null when unknown. Returns true on the grant frame. */
  update(T: number, granted: boolean, wishPos: Vector3 | null, W: number, D: number): boolean {
    const v = this.view;
    this.pos.set(cellX(v.x, W), levelY(v.level), cellZ(v.z, D));
    const r = this.rig;
    r.root.position.copy(this.pos);
    // lounging: a loaf facing the room, the head following the wished prop, a slow tail flick, slow blinks
    const toward = wishPos ? Math.atan2(wishPos.x - this.pos.x, wishPos.z - this.pos.z) : 0;
    const yaw = Math.atan2(-this.pos.x * 0.5, 2 - this.pos.z);
    r.root.rotation.set(0, yaw, 0);
    let hy = Math.max(-0.8, Math.min(0.8, angleDelta(yaw, toward)));
    if (!wishPos) hy = Math.sin(T / 40) * 0.3;
    const ti = Math.floor(T);
    const won = granted || v.granted;
    poseCat(r, { T, act: 0, actP: 0, moving: 0, phase: 0, blink: won ? ti % 60 < 30 : ti % 120 < 6, loaf: won ? 0 : 1, sit: won ? 1 : 0, headYaw: hy, lid: won && ti % 60 >= 30 ? 'half' : undefined });
    let fired = false;
    if (won && !this.granted) {
      this.granted = true;
      this.grantedT = T;
      this.applyBubble(true);
      fired = true;
    }
    const halfW = (W * CELL_M) / 2;
    const side = halfW > 0 ? Math.max(-1, Math.min(1, this.pos.x / halfW)) : 0;
    const hasWish = !!this.bubbleMat.map && (v.wishProp >= 0 || won) && !this.hideLabels;
    this.bubble.visible = hasWish;
    if (hasWish) {
      const pop = won && this.grantedT >= 0 ? Math.min(1, (T - this.grantedT) / 6) : 1;
      const bob = Math.sin(T * 0.12) * 0.015;
      const sc = 0.055 * (won ? 0.6 + 0.4 * pop + Math.sin(T * 0.4) * 0.04 : 1);
      this.bubble.scale.set(sc, sc, 1);
      this.bubble.position.set(this.pos.x + 0.05, this.pos.y + 0.5 + bob, this.pos.z);
      // near the right wall the bubble opens to the left, so it stays on screen
      this.bubble.center.set(side > 0.4 ? 0.8 : 0.2, 0);
    }
    this.badge.visible = !!this.texBadge && !this.hideLabels;
    if (this.badge.visible) {
      this.badge.scale.set(0.11, 0.028, 1);
      // round 2: "AUKSTE · ACCOMPL…" was cut at the right edge: near a side wall the ribbon grows toward the room
      this.badge.center.set(0.5 + side * 0.42, 1);
      this.badge.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z + 0.18);
    }
    return fired;
  }

  prewarm(): Texture[] {
    return [this.texWish, this.texHeart, this.texBadge].filter((t): t is Texture => !!t);
  }

  dispose(): void {
    disposeCatRig(this.rig);
    this.texWish?.dispose();
    this.texHeart?.dispose();
    this.texBadge?.dispose();
    this.bubbleMat.dispose();
    this.badgeMat.dispose();
  }
}
