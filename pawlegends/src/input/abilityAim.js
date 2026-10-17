// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/companions/abilityAim.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/companions/abilityAim.js  (owner: companions) — kitten-ability aiming under the iso controls
// (research/CONTROLS_SPEC.md §7.1, §7.5, §6.2–6.4, §9.4). Pure helpers over a duck-typed ctx (no DOM, no THREE):
//   playerAimYaw(ctx)          her aim as a facing yaw: player.aim.dir, else player.resolveAim('ability'), else the
//                              §7.1 precedence this area can see (cursor, selected target, movement, facing)
//   explicitAim(ctx, out)      a touch drag-aim or pad right-stick vector, mapped to a world direction (§9.4)
//   cursorGround(ctx)          the KBM cursor on the ground (camera's Picker), or null
//   planAbility(ctx, c, req)   what a cast would do: the Shield Wall rect, the Volley targets, the Purr ring
//                              (smart rules when `req` has no dir / point, aimed rules otherwise; §7.5)
//   abilityShape(cfg)          static indicator shape and range of a companion's ability (ranges overlay, ui)
// Every other area's name is read defensively (P0/P1 contracts may not have landed): `ctx.cam.cursorGround`,
// `ctx.input.aimStick`, `ctx.input.virtualAim`, `ctx.player.aim`, `config.AIM`.
import * as CONFIG from '../render/ppk/core/config.js';
import { camForwardYaw, isEngaged, isFlyer, screenToWorldDir } from '../render/ppk/companions/steering.js';

const AIM = CONFIG.AIM ?? {};

/** Cast-input tuning (CONTROLS_SPEC §6.2 Q / §6.3 LT / §9.4 drag-aim; numbers from §13 AIM / TOUCH where they exist). */
export const CAST = Object.freeze({
  hold: 0.2,                               // s held before a press shows the indicator (shorter = a tap = quick cast)
  stickDead: 0.35,                         // §7.1: the pad RS counts as an explicit aim past 0.35
  dragDead: 0.18,                          // a normalised touch drag shorter than this is a tap (16 px of 90 px)
  dragRangePx: CONFIG.TOUCH?.aimRangePx ?? 90,   // §9.4: drag magnitude ÷ 90 px maps to range
  padAimMax: AIM.padAimMax ?? 6,           // §6.3: the RS reticle reaches 6 m from her
  dirPoint: 6,                             // an aim with a direction only (no point) looks this far along it
  selExtra: 1.5,                           // §7.1 step 4: a selected target counts within range + 1.5 m
  moveDead: 0.3,                           // §7.1 step 6: movement past 0.3
  wallDepth: 0.4,                          // §7.5 Shield Wall indicator: 3.0 × 0.4 m rect
  purrR: 1.2,                              // §7.5 Clover: soft green ring around her (m)
});

/** Enemy FSM states that count as "winding up on her" for the Volley pick (§7.2 Wild Rift priority). */
const WINDUP = new Set(['windup', 'aim', 'lunge', 'charge', 'telegraph']);

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const hyp = Math.hypot;

/** The selected target (§7.4: `cam.lockTarget` stays the selection store), if alive and hostile; else null. */
export function selectedTarget(ctx) {
  const t = ctx?.cam?.lockTarget ?? ctx?.cam?.target ?? null;
  return t && t.alive !== false && t.hurtable !== false && t.faction === 'enemy' && t.pos ? t : null;
}

/** The camera yaw movement and drag vectors map through (§2.2 stick latch), as FollowCamera's yaw convention. */
function inputYaw(ctx) {
  const c = ctx?.cam;
  if (fin(c?.stickYaw)) return c.stickYaw;
  if (fin(c?.yaw)) return c.yaw;
  return Math.PI;                                              // CAMERA.iso.yaw default: camera south, looking +Z
}

/**
 * The KBM cursor on the ground ({x, y, z}) when it means something (KBM device, not keyboard-only, not the classic
 * pointer-locked camera, the pick hit something), else null.
 */
export function cursorGround(ctx) {
  const cam = ctx?.cam, inp = ctx?.input;
  if (!cam || cam.cursorValid === false) return null;
  if (inp?.device && inp.device !== 'kbm') return null;
  if (inp?.preset === 'keyboardOnly' || ctx?.params?.cam === 'classic') return null;
  const g = cam.cursorGround;
  return g && fin(g.x) && fin(g.z) ? g : null;
}

/**
 * Explicit aim (§7.1 step 2): a touch drag on the button (`input.virtualAim {x, y, active}`, screen space, y up) or the
 * pad right stick (`input.aimStick {x, y}`, y up) past its dead zone. Writes `out.x/z` (unit world direction), `out.mag`
 * (0..1 of the reach), `out.source` ('touch' | 'pad'); returns `out`, or null when there is none.
 */
export function explicitAim(ctx, out) {
  const inp = ctx?.input;
  if (!inp) return null;
  const va = inp.virtualAim;
  if (va && va.active !== false && fin(va.x) && fin(va.y)) {
    let len = hyp(va.x, va.y);
    if (len > 1.5) len /= CAST.dragRangePx;                     // CSS px from the ui → fraction of the reach
    if (len >= CAST.dragDead && screenToWorldDir(va.x, va.y, inputYaw(ctx), out)) {
      out.mag = Math.min(1, len); out.source = 'touch';
      return out;
    }
  }
  const rs = inp.aimStick;
  if (rs && fin(rs.x) && fin(rs.y)) {
    const len = hyp(rs.x, rs.y);
    if (len >= CAST.stickDead && screenToWorldDir(rs.x, rs.y, inputYaw(ctx), out)) {
      out.mag = Math.min(1, len); out.source = 'pad';
      return out;
    }
  }
  return null;
}

const _ex = { x: 0, z: 0, mag: 0, source: '' };
const _mv = { x: 0, z: 0 };

/**
 * Her aim as a facing yaw (radians, atan2(x, z)) for the abilities and the companions' "keep off the aim notch" rule.
 * CONTROLS_SPEC §12 companions 1: `player.aim.dir`, else `resolveAim('ability')`; until the player's Aim.js lands this
 * walks the §7.1 precedence it can see: explicit aim, cursor, selected target, movement, facing (the classic camera:
 * camera-forward, the M1 rule).
 */
export function playerAimYaw(ctx) {
  const p = ctx?.player;
  const a = p?.aim;
  if (a?.dir && fin(a.dir.x) && fin(a.dir.z) && hyp(a.dir.x, a.dir.z) > 1e-4) return Math.atan2(a.dir.x, a.dir.z);
  if (typeof p?.resolveAim === 'function') {
    try {
      const r = p.resolveAim('ability');
      if (r?.dir && fin(r.dir.x) && fin(r.dir.z) && hyp(r.dir.x, r.dir.z) > 1e-4) return Math.atan2(r.dir.x, r.dir.z);
    } catch { /* player mid-edit: fall through */ }
  }
  if (!p?.pos) return fin(ctx?.cam?.yaw) ? camForwardYaw(ctx.cam.yaw) : 0;
  const ex = explicitAim(ctx, _ex);
  if (ex) return Math.atan2(ex.x, ex.z);
  const g = cursorGround(ctx);
  if (g && hyp(g.x - p.pos.x, g.z - p.pos.z) > 0.3) return Math.atan2(g.x - p.pos.x, g.z - p.pos.z);
  const sel = selectedTarget(ctx);
  if (sel && hyp(sel.pos.x - p.pos.x, sel.pos.z - p.pos.z) > 0.05) return Math.atan2(sel.pos.x - p.pos.x, sel.pos.z - p.pos.z);
  const mv = ctx.input?.move;
  if (mv && fin(mv.x) && fin(mv.y) && hyp(mv.x, mv.y) >= CAST.moveDead && screenToWorldDir(mv.x, mv.y, inputYaw(ctx), _mv)) return Math.atan2(_mv.x, _mv.z);
  if (ctx.params?.cam === 'classic' && fin(ctx.cam?.yaw)) return camForwardYaw(ctx.cam.yaw);
  return fin(p.facing) ? p.facing : 0;
}

/** @deprecated M1 name (camera-forward); kept for callers outside this area. Now the iso aim. */
export const playerForwardYaw = playerAimYaw;

/** Static indicator shape and range per ability (ui's ranges overlay and ability bar tooltips). */
export function abilityShape(cfg) {
  switch (cfg?.ability) {
    case 'shieldWall': return { ability: 'shieldWall', shape: 'rect', range: cfg.dist, width: cfg.width, length: CAST.wallDepth };
    case 'volley': return { ability: 'volley', shape: 'targets', range: cfg.range, width: 0, length: 0, targets: cfg.targets };
    case 'mend': return { ability: 'mend', shape: 'self', range: 0, width: CAST.purrR * 2, length: CAST.purrR * 2 };
    default: return null;
  }
}

/** A fresh plan object (reused by callers: planAbility writes into it). */
export function newPlan() {
  return { ability: null, kittenId: null, shape: null, valid: false, aimed: false, source: 'smart', yaw: 0,
    dir: { x: 0, z: 1 }, point: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 },
    range: 0, width: 0, length: 0, radius: 0, targets: [] };
}

/** Hostile, alive, hurtable, not hidden in a cutscene / dive cloud. */
function shootable(e) {
  return !!e && e.alive && e.faction === 'enemy' && e.hurtable !== false && !e.scripted && e.hidden !== true && !!e.pos;
}

/** Volley targets must be this far (m) inside the visible frame (CONTROLS §8.5 / requests/fx.md). */
export const VOLLEY_SCREEN_MARGIN = 0.5;

const _cand = [];
const _score = new Map();

/**
 * Plan a cast of companion `c`'s ability (§7.5). `req` = { dir?: {x, z}, point?: {x, y?, z}, mag?: 0..1, source? };
 * neither dir nor point → the smart rules. Writes and returns `out` (`valid` false = nothing to do: no cooldown spent).
 *   shieldWall  aimed: 1.5 m along the aim; smart: between her and the centroid of engaged enemies within 6 m, else
 *               along her facing. `center`, `yaw`, rect `width` × `length`.
 *   volley      ≤ 3 targets within 14 m of her (the selected one first, so it takes 2 of the 5 arrows); aimed: the
 *               ones nearest the aim point; smart: Wild Rift order (wind-up on her, flyers, engaged, low HP, near).
 *   mend        self: a soft ring around her.
 */
export function planAbility(ctx, c, req = null, out = newPlan()) {
  const cfg = c?.cfg ?? {}, p = ctx?.player;
  out.ability = cfg.ability ?? null; out.kittenId = c?.kittenId ?? null;
  out.valid = false; out.aimed = false; out.source = req?.source ?? 'smart'; out.targets.length = 0;
  out.range = 0; out.width = 0; out.length = 0; out.radius = 0; out.shape = null;
  if (!p?.pos || !out.ability) return out;
  out.origin.x = p.pos.x; out.origin.y = p.pos.y; out.origin.z = p.pos.z;

  // the request's direction / point (a point wins: it carries the distance too)
  let dx = 0, dz = 0, aimed = false;
  const pt = req?.point;
  if (pt && fin(pt.x) && fin(pt.z)) {
    dx = pt.x - p.pos.x; dz = pt.z - p.pos.z;
    if (hyp(dx, dz) > 0.05) aimed = true;
  }
  if (!aimed && req?.dir && fin(req.dir.x) && fin(req.dir.z) && hyp(req.dir.x, req.dir.z) > 1e-4) {
    dx = req.dir.x; dz = req.dir.z; aimed = true;
  }
  const dl = aimed ? hyp(dx, dz) : 1;
  if (aimed) { out.dir.x = dx / dl; out.dir.z = dz / dl; }
  out.aimed = aimed;
  if (aimed && pt && fin(pt.x)) { out.point.x = pt.x; out.point.z = pt.z; out.point.y = fin(pt.y) ? pt.y : p.pos.y; }
  else if (aimed) {
    const reach = fin(req?.mag) ? Math.max(0.5, req.mag) * (cfg.range ?? CAST.dirPoint) : CAST.dirPoint;
    out.point.x = p.pos.x + out.dir.x * reach; out.point.z = p.pos.z + out.dir.z * reach; out.point.y = p.pos.y;
  }
  if (!aimed) out.source = 'smart';

  switch (out.ability) {
    case 'shieldWall': {
      out.shape = 'rect'; out.width = cfg.width; out.length = CAST.wallDepth; out.range = cfg.dist;
      let yaw;
      if (aimed) yaw = Math.atan2(out.dir.x, out.dir.z);
      else {
        let n = 0, cx = 0, cz = 0;
        for (const e of ctx.enemies?.list ?? []) {
          if (!shootable(e) || !isEngaged(e)) continue;
          if (hyp(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > (cfg.taunt ?? 6)) continue;
          cx += e.pos.x; cz += e.pos.z; n++;
        }
        if (n && hyp(cx / n - p.pos.x, cz / n - p.pos.z) > 0.2) yaw = Math.atan2(cx / n - p.pos.x, cz / n - p.pos.z);
        else if (ctx.params?.cam === 'classic' && fin(ctx.cam?.yaw)) yaw = camForwardYaw(ctx.cam.yaw);
        else yaw = fin(p.facing) ? p.facing : 0;
        out.dir.x = Math.sin(yaw); out.dir.z = Math.cos(yaw);
      }
      out.yaw = yaw;
      out.center.x = p.pos.x + Math.sin(yaw) * cfg.dist; out.center.z = p.pos.z + Math.cos(yaw) * cfg.dist; out.center.y = p.pos.y;
      if (!aimed) { out.point.x = out.center.x; out.point.z = out.center.z; out.point.y = out.center.y; }
      out.valid = true;
      break;
    }
    case 'volley': {
      out.shape = 'targets'; out.range = cfg.range;
      const sel = selectedTarget(ctx), max = cfg.targets ?? 3;
      _cand.length = 0; _score.clear();
      // §8.5 no off-screen snipes (requests/fx.md): only what the player can see (SafeFrame-visible, K4) is a target
      const onScreen = typeof ctx.cam?.onScreen === 'function' ? ctx.cam : null;
      for (const e of ctx.enemies?.list ?? []) {
        if (!shootable(e)) continue;
        const d = hyp(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (d > cfg.range) continue;
        if (onScreen && !onScreen.onScreen(e.pos, VOLLEY_SCREEN_MARGIN)) continue;
        let s;
        if (aimed) s = hyp(e.pos.x - out.point.x, e.pos.z - out.point.z);
        else {
          const lowHp = fin(e.hp) && fin(e.maxHp) && e.maxHp > 0 && e.hp / e.maxHp < 0.3;
          s = d - (WINDUP.has(e.stateName) && isEngaged(e) ? 2.5 : 0) - (isFlyer(e) ? 3 : 0) - (isEngaged(e) ? 2 : 0)
            - (e === sel ? 1 : 0) - (lowHp ? 0.8 : 0);
        }
        _score.set(e, s); _cand.push(e);
      }
      _cand.sort((a, b) => _score.get(a) - _score.get(b));
      for (let i = 0; i < _cand.length && out.targets.length < max; i++) out.targets.push(_cand[i]);
      // the selected target leads the round-robin (§7.5: it takes 2 of the 5 arrows) when it made the cut, or when
      // there was room for it
      if (sel && _score.has(sel)) {
        const i = out.targets.indexOf(sel);
        if (i > 0) { out.targets.splice(i, 1); out.targets.unshift(sel); }
        else if (i < 0 && !aimed) { out.targets.unshift(sel); if (out.targets.length > max) out.targets.length = max; }
      }
      _cand.length = 0; _score.clear();
      const t0 = out.targets[0];
      out.yaw = t0 ? Math.atan2(t0.pos.x - p.pos.x, t0.pos.z - p.pos.z) : Math.atan2(out.dir.x, out.dir.z);
      if (!aimed) { out.dir.x = Math.sin(out.yaw); out.dir.z = Math.cos(out.yaw); if (t0) { out.point.x = t0.pos.x; out.point.z = t0.pos.z; out.point.y = t0.pos.y; } }
      out.center.x = p.pos.x; out.center.y = p.pos.y; out.center.z = p.pos.z;
      out.valid = out.targets.length > 0;
      break;
    }
    case 'mend': {
      out.shape = 'self'; out.radius = CAST.purrR; out.width = out.length = CAST.purrR * 2;
      out.yaw = fin(p.facing) ? p.facing : 0;
      out.center.x = p.pos.x; out.center.y = p.pos.y; out.center.z = p.pos.z;
      if (!aimed) { out.point.x = p.pos.x; out.point.y = p.pos.y; out.point.z = p.pos.z; }
      out.valid = p.alive !== false;
      break;
    }
    default: break;
  }
  return out;
}
