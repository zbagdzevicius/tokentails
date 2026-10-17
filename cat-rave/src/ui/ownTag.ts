/**
 * L-UI: a floating name tag over the viewer's own cat ("Mochi · yours, dancing", or its confirming hologram), so a buyer
 * can tell which cat on the floor is theirs. A DOM label projected from the hologram's floor
 * position each frame; the name goes in with textContent only. Hidden behind the camera, off screen and
 * while a sheet is open (hud.css).
 */
import { Vector3, type Camera } from 'three';

export interface OwnTag {
  readonly el: HTMLElement;
  /** The tag text (the buyer's first cat name), or null to hide it; `confirming` while its payment confirms. */
  set(name: string | null, cats?: number, state?: 'dancing' | 'confirming'): void;
  /** Places the tag over `world` (hologram floor point) for `camera`; null hides it. */
  update(camera: Camera, world: Vector3 | null, width: number, height: number): void;
  /** A short pulse (the viewer tapped their own arrivals row). */
  pulse(): void;
}

/** Height above the hologram's reference point (0.55 m up its body, crowd.arrivingPosition): just over its head. */
const TAG_LIFT = 0.85;
/** Gap kept from the viewport edges (px). */
const EDGE = 8;

export function createOwnTag(parent: HTMLElement, doc: Document = document): OwnTag {
  const el = doc.createElement('div');
  el.className = 'rv-own-tag';
  el.setAttribute('aria-hidden', 'true');
  const name = doc.createElement('b');
  const sub = doc.createElement('small');
  sub.textContent = 'yours · dancing 🪩';
  el.append(name, sub);
  el.hidden = true;
  parent.append(el);
  let on = false;
  // Tag size, measured once per text (no layout read every frame).
  let tagW = 0;
  let tagH = 0;
  const p = new Vector3();
  return {
    el,
    set(text, cats = 1, state = 'dancing') {
      on = !!text;
      if (!text) {
        el.hidden = true;
        return;
      }
      sub.textContent = state === 'confirming' ? 'yours · confirming' : 'yours · dancing 🪩';
      name.textContent = cats > 1 ? `${text} +${cats - 1}` : text;
      tagW = 0;
    },
    update(camera, world, width, height) {
      if (!on || !world) {
        el.hidden = true;
        return;
      }
      p.copy(world);
      p.y += TAG_LIFT;
      p.project(camera);
      const visible = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      el.hidden = !visible;
      if (!visible) return;
      // Kept inside the viewport, so a hologram at the frame edge still shows its whole tag.
      if (!tagW) {
        tagW = el.offsetWidth;
        tagH = el.offsetHeight;
      }
      const half = tagW / 2;
      const x = Math.min(width - half - EDGE, Math.max(half + EDGE, ((p.x + 1) / 2) * width));
      const y = Math.max(tagH + EDGE, ((1 - p.y) / 2) * height);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    },
    pulse() {
      el.classList.remove('rv-own-pulse');
      void el.offsetWidth;
      el.classList.add('rv-own-pulse');
    },
  };
}
