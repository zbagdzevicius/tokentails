/**
 * Trailer v3.4 (review of v3.3: 38 defects; the user's verdict still "full of bugs, from above like real gameplay, sell
 * cats vs dogs and the mission"). v3.4: the hook is a two-sided exchange (take H1: Sir Brutus charges Clem, Clem
 * answers) that cranes up to the whole Crossing (both bases, CATS over the cat side, DOGS over the dog side) and back
 * down to the gameplay view; 3V3 is take W9 (all six, the cats 13-6 up, the twin dogs on their own persona plates);
 * the tower falls along an open lane (take T1); the gameplay-camera shots carry the real score bar and minimap
 * ('hudlite'). Earlier notes (v3.3) follow.
 *
 * Trailer v3.3 ("Settle It on the Crossing", review of v3.2: "full of bugs, from above like real gameplay, sell cats
 * vs dogs and the mission") shot list: 30 s at 60 fps, 144 BPM (25 frames per beat). Every gameplay shot is the
 * game's own camera at its own distance: the real follow camera on the take's human (`cam.base: 'game'`, harness.ts
 * placeGameRel: its lead toward the enemy core and its fight pull-back) with the director's deltas on top, or, when
 * the subject is not the human, the same numbers as a preset (GAMECAM: pitch 48.8, FOV 38, the game's 4 m lead and
 * 0.8 m south). v3.3: every shot starts and ends at the gameplay distance (1.0); a push (to 0.9 at most) or the hook's
 * crane (to 1.3 at most) happens only round its beat. `gameLook`: no render clean-up hack.
 *
 *   node tools/trailer/capture.mjs --shots-file tools/trailer/v3/shots.mjs --aspect 16x9 --out <dir>/shots-l
 *
 * Landscape: 1280x720 CSS px at DPR 1.5 (1920x1080). Portrait: 540x960 CSS px at DPR 2 (1080x1920) with GAMECAM-P
 * (pitch 48.8, FOV 50, 1.2x the distance) on the subject: every 9:16 shot is captured natively (no landscape band).
 * Windows come from a QC scan of each take (capture.mjs --qc): no frame with bodies overlapping or in contact, a minion
 * inside a hero, a hero in a structure, a twin hero side by side, text at the edge or a stale number.
 */

/** v3 render settings: the frame as the game draws it. */
const V3 = {
  gameLook: true,
  xray: false,
  banners: true,
  ghosts: true,
  bolts: true,
  shockI: 1,
  realFlash: true,
  flashMax: 0.16,
  size: [1280, 720],
  dpr: 1.5,
  layers: ['pops', 'banner', 'plates'],
  popText: ['Takedown!'],
  selfName: true,
  // v3.4: a hero picked twice by the dogs keeps the game's persona plate ("Duke the Brutus", "Bolt the Brutus")
  twinNames: true,
  edgeArrows: false,
  bannerOn: [],
  // v3.3: 10 frames through the real frame path before f0 (no units holding still on the cut)
  lead: 10,
};
const P = { width: 540, height: 960, dpr: 2 };
/** v3.4: the real HUD's score bar and minimap on the gameplay-camera shots (landscape; 9:16 keeps the clean frame). */
const LITE = { layers: ['pops', 'banner', 'plates', 'hudlite'] };
const NOHUD = { layers: ['pops', 'banner', 'plates'] };
/** The whole Crossing: the map centre (Pudding's pad), sim mm. */
const CENTRE = [50000, 30000];
/** v3.7: the dog core (the bone-topped doghouse), sim mm. */
const DOG_CORE = [90000, 30000];
/** v3.7 S15 camera keys at base distance `d`: R1 pushes on the hits, the big push into the break, back by f1355. */
const S15_KEYS = (d) => [
  { f: 1150, dist: d }, { f: 1200, dist: d },
  ...[1225, 1250, 1275].flatMap((f) => [{ f: f - 6, dist: d }, { f, dist: d * 0.93, ease: 'out' }, { f: f + 14, dist: d, ease: 'ease' }]),
  { f: 1300, dist: d }, { f: 1318, dist: d * 0.91, ease: 'ease' }, { f: 1331, dist: d * 0.9, ease: 'out' },
  { f: 1355, dist: d, ease: 'ease' }, { f: 1389, dist: d },
];

/** The game's camera with deltas (dist multiple, pitch / yaw degrees added). */
const game = (keys, target = null) => ({ base: 'game', target, keys });
/** GAMECAM as a director preset on `target`, with the game's 4 m lead toward the dog core and 0.8 m south. */
const preset = (target, keys, off = [4, 0.8]) => ({ target, keys: keys.map((k) => ({ fov: 38, pitch: 48.8, yaw: 0, lift: 0, ...k })), smooth: 0.12, off });
/**
 * v3.6: the 9:16 look point sits this far north of the subject (m, [x, z]: z < 0 is north), so the bodies and plates
 * (which stand up from the look point) land near the middle of the tall frame, not in its top third over an empty
 * plaza (v3.5 review).
 */
const PORT_OFF = [0, -2.2];
/** v3.6: the 9:16 crane's top distance (x the game camera's): both bases across the 1080 px width at pitch 72. */
const PORT_CRANE = 5.3;
/** v3.7: the 9:16 crane's quarter turn (the Crossing along the tall frame, the cat base at the top). */
const PORT_YAW = 90;
/** v3.7: the 9:16 hook's look point, further north, so the heroes land mid-frame and the sand disc mostly leaves it. */
const PORT_OFF_S01 = [0, -4.2];
/** GAMECAM-P (9:16): pitch 48.8, FOV 50, 1.2x the distance, the subject centred (PORT_OFF). */
const portrait = (target, keys, o = {}) => ({
  ...P,
  cam: { target, keys: keys.map((k) => ({ fov: 50, pitch: 48.8, yaw: 0, lift: 0, ...k, dist: Math.round(1200 * (k.dist ?? 1) * (o.wide ?? 1)) / 1000 })), smooth: 0.12, off: o.off ?? PORT_OFF },
  ...(o.extra ?? {}),
});
/**
 * v3.6: the game's own camera (its distance, pitch and fight pull-back) looking at `target` instead of the player:
 * the roll-call shots whose subject is not the take's human (v3.5 used a GAMECAM preset there, framed tighter and with
 * no HUD, so the look flipped HUD / no HUD at every name-card cut).
 */
const onSubject = (target, keys) => game(keys.map((k) => ({ blend: 1, ...k })), target);
/** A push round the beat: gameplay distance before and after, `d` on the beat (frames a, beat, b). */
const push = (a, beat, b, d = 0.9) => [{ f: a, dist: 1 }, { f: beat, dist: d, ease: 'ease' }, { f: b, dist: 1, ease: 'ease' }];

/**
 * v3.7 S14 + S14B (frames 900-1149): the KO at the dog base (F1, 75 frames: the KO and the cats' answer), then Clem's
 * fight on the cat-side bridge (V1: her R lands on Sir Brutus and Muffin the Cacklejaw is taken down). v3.6's S16
 * (CALM PUDDING. over a flan on the river island) is cut: the v3.6 review found nothing visibly happens in it, the
 * game's calm banner was tiny, and it broke the mission's build-up (lane, towers, core). The V1 window is the take's
 * clean span in the QC scan (941-1120 at the anchor below, every body apart, both teams in frame).
 */
const TEAMFIGHT_SHOTS = [
  {
    // Sage is the player: Bengas takes Cacklejaw down at the dog base (f906); the shot ends before the stand-off
    id: 'S14', ...V3, ...LITE, take: 'F1', f0: 900, f1: 974,
    anchor: { key: 'ko', frame: 906 },
    cam: game([{ f: 900, dist: 1 }, { f: 912, dist: 0.9, ease: 'out' }, { f: 974, dist: 1, ease: 'ease' }]),
    // 9:16 (v3.7): the fight and the dome entrance in the middle of the tall frame (v3.6 pushed them to the right
    // edge over an empty lower half with the Fish Snack's beam in it)
    portrait: portrait({ mid: [0, 2] }, [{ f: 900, dist: 1.25 }, { f: 912, dist: 1.15, ease: 'out' }, { f: 974, dist: 1.25, ease: 'ease' }], { off: [1.5, -5.5], extra: NOHUD }),
  },
  {
    // Clem (the player) brawls Sir Brutus and Muffin the Cacklejaw at the cat-side bridge: her R on f1109, the
    // takedown ~f1133; a push on the R that eases back to the gameplay distance by the cut
    id: 'S14B', ...V3, ...LITE, take: 'V1', f0: 975, f1: 1149,
    anchor: { key: 'r', frame: 1109 },
    cam: game([{ f: 975, dist: 1 }, { f: 1085, dist: 1 }, { f: 1109, dist: 0.88, ease: 'ease' }, { f: 1149, dist: 0.97, ease: 'ease' }]),
    portrait: portrait({ unit: 0 }, [{ f: 975, dist: 1 }, { f: 1085, dist: 1 }, { f: 1109, dist: 0.95, ease: 'ease' }, { f: 1149, dist: 1, ease: 'ease' }], { wide: 1.1, off: [1.5, -3], extra: NOHUD }),
  },
];

export const SHOTS = [
  // ---------------------------------------------------------------- S01 HOOK + CATS VS DOGS (take H1, Clem is the player)
  {
    // the gameplay camera on Clem in the river by Pudding's pad: Sir Brutus charges in and hits her (the dog swing, a
    // short slow-motion dip), Clem answers; then a crane up to the whole Crossing (the yarn core left, the bone
    // doghouse right; v3.5: up in 24 frames, f38-62, mirroring the descent) for CATS VS DOGS, and (v3.5) back down
    // into the real gameplay camera inside the shot: the descent starts on the half-beat f112 (the words wipe on
    // f115) and lands, eased, on the next half-beat (f137), held on the gameplay view to the downbeat cut. While the map is wide (every hero a speck) the clock runs at 4.2x, so
    // the camera lands about 370 frames of real time after f0, as Clem's Q settles and the dogs fall back (Sir Brutus
    // and the second Cacklejaw out on the right, Gabė and Clem with Muffin in the river), every body apart: the clean
    // window of the take is 324-387 (v3.4's descent landed on the Clem / Sir Brutus pile at 200-320, where the melee
    // keeps their swings touching). The plates and the HUD fade out on the way up and back in on the way down.
    // v3.6 (review of v3.5: the rise was a 14-frame snap with the clock jumping to 4.2x at once, the 9:16 crane spun
    // the map 90° each way, and the landing put Sir Brutus over Bruno the Cacklejaw): one eased crane, up in 34 frames
    // (f32-66, smoothstep) and down in 34 (f103-137, landing on the half-beat), the clock at 1x on the way up and down;
    // it runs 5.3x only while the map is wide (f74-96), so the landing is the take's clean moment after the exchange
    // (the 16:9 and 9:16 QC scans of H1 at the gameplay camera: bodies apart from 229 to 280 frames of real time)
    id: 'S01', ...V3, ...LITE, take: 'H1', f0: 0, f1: 149,
    anchor: { key: 'charge', frame: 22 },
    ramp: [[0, 1], [18, 1], [22, 0.55, 'out'], [30, 0.55], [38, 1, 'ease'], [66, 1], [74, 5.3, 'ease'], [96, 5.3], [103, 1, 'ease']],
    uiFade: [[32, 1], [46, 0], [124, 0], [137, 1]],
    hudFade: [[32, 1], [46, 0], [124, 0], [137, 1]],
    cam: game([
      { f: 0, dist: 1, pitch: 0, blend: 0 },
      { f: 22, dist: 0.92, ease: 'out' },
      { f: 32, dist: 0.95, pitch: 0, blend: 0, ease: 'ease' },
      { f: 66, dist: 3.75, pitch: 11.2, blend: 1, ease: 'ease' },
      { f: 103, dist: 3.5, pitch: 11.2, blend: 1, ease: 'linear' },
      { f: 137, dist: 1, pitch: 0, blend: 0, ease: 'ease' },
      { f: 149, dist: 1, pitch: 0, blend: 0 },
    ], { point: CENTRE }),
    // 9:16 (v3.7, review of v3.6: with yaw 0 the base-to-base axis ran across the narrow width, both bases cut in half
    // and 55 % of the frame empty grass): the crane turns a quarter as it rises, so the Crossing runs down the tall
    // frame (the cat base at the top under CATS, the dog base at the bottom under DOGS), and turns back as it comes
    // down; it lands on the opening framing (distance, pitch, yaw) on f125 and holds it 24 frames to the cut
    portrait: {
      ...P, ...NOHUD,
      cam: {
        target: { blend: [{ blend: [{ unit: 0 }, { point: CENTRE }], f0: 32, f1: 66 }, { unit: 0 }], f0: 97, f1: 125 },
        keys: [
          { f: 0, dist: 1.05, pitch: 48.8, fov: 50, yaw: 0, lift: 0 },
          { f: 22, dist: 0.98, ease: 'out' },
          { f: 32, dist: 1.05, pitch: 48.8, yaw: 0, ease: 'ease' },
          { f: 66, dist: PORT_CRANE, pitch: 78, yaw: PORT_YAW, ease: 'ease' },
          { f: 97, dist: PORT_CRANE * 0.97, pitch: 78, yaw: PORT_YAW, ease: 'linear' },
          { f: 125, dist: 1.05, pitch: 48.8, yaw: 0, ease: 'ease' },
          { f: 149, dist: 1.05, pitch: 48.8, yaw: 0 },
        ],
        smooth: 0.12,
        off: PORT_OFF_S01,
      },
    },
  },
  // ---------------------------------------------------------------- S02 3V3: the real HUD on the gameplay camera (take W9, Bengas)
  {
    // all six heroes round Pudding's pad, the cats 13-6 up: Bengas, Sage and Gabė trade with the two Sir Brutus
    // ("Duke" and "Bolt", the game's own persona plates) and Cacklejaw; the full HUD as a player sees it
    // v3.6: the objective toast ("Calm Pudding! ...") and the sudden-death subline are hidden (they competed with 3V3
    // and spent the Pudding beat 15 s early); the score bar, minimap and ability bar stay
    id: 'S02', ...V3, take: 'V10', f0: 150, f1: 299, layers: ['hud'], hide: ['.pl-goal', '.pl-score .phase'], selfName: false, edgeArrows: true,
    // v3.6: take V10 (W9's six stood in one pile: Bolt the Brutus's head in Gabė; v3.5 review), from the moment all
    // six stand apart round the cat-side bridge; the look point 60 % of the way to the six's centroid
    anchor: { key: 'six', offset: 7.5, frame: 150 },
    // v3.7 (review: 2 s of stand-off, Sage half in a bush, Bengas under the ability bar): the opening runs at 1.25x
    // (Sage walks out of the bush, the lines close in) and eases to 0.85x by f180, so the first hits land under the type;
    // the whole shot still sits inside the six's clean span (ticks 8105-8183); the look point 1.5 m south (everything
    // rides up: Bengas clears the ability bar) and v3.7's bush cut clears the leaves round Sage
    ramp: [[150, 1.25], [180, 0.85, 'ease']],
    cam: { ...game([{ f: 150, dist: 1, blend: 0.6 }, { f: 225, dist: 0.97, blend: 0.6, ease: 'ease' }, { f: 299, dist: 1, blend: 0.6, ease: 'ease' }], { mid: [0, 1, 2, 3, 4, 5] }), off: [0, 1.5] },
    // 9:16: centred on the six (Gabė at the left end, Cacklejaw at the right), pulled out so all of them fit
    // v3.6: on the centroid of all six (v3.5's midpoint of two left Gabė and Bolt the Brutus half off the left edge)
    portrait: portrait({ mid: [0, 1, 2, 3, 4, 5] }, [{ f: 150, dist: 1.42, pitch: 55 }, { f: 299, dist: 1.36, pitch: 55, ease: 'linear' }], { extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S03-S06 THE RIVALRY (cat, dog, dog)
  {
    // Clem's Tumble at Sir Brutus by the dog tower (take V2, Clem is the player)
    id: 'S03', ...V3, ...LITE, take: 'V2', f0: 300, f1: 349,
    anchor: { key: 'e', frame: 324 },
    cam: game(push(300, 324, 349, 0.85)),
    portrait: portrait({ mid: ['@clem', '@brutus'] }, push(300, 324, 349), { wide: 1.1, extra: NOHUD }),
  },
  {
    // the dogs answer: Cacklejaw's Pack Hunt on Gabė at the cat-side bridge (take V3; v3.3's Z1 window had Lambo's
    // flop snap through him)
    id: 'S04', ...V3, ...LITE, take: 'V3', f0: 350, f1: 399,
    anchor: { key: 'cackR', frame: 360 },
    cam: onSubject({ mid: ['@cack', '@gabe'] }, push(350, 366, 399, 0.88)),
    portrait: portrait({ mid: ['@cack', '@gabe'] }, push(350, 366, 399, 0.94), { wide: 1.1, extra: NOHUD }),
  },
  {
    // Sir Brutus's Champion's Challenge (take V5): no push (its ring is large and pale)
    id: 'S06', ...V3, ...LITE, take: 'V5', f0: 400, f1: 449,
    anchor: { key: 'brutusR', frame: 420 },
    // v3.7: the look point 3.5 m west, so Bruno the Cacklejaw and the cat cart pile leave the frame on the right
    cam: { ...onSubject({ unit: '@brutus' }, [{ f: 400, dist: 1 }, { f: 420, dist: 0.92, ease: 'ease' }, { f: 449, dist: 0.96, ease: 'ease' }]), off: [-3.5, 0] },
    portrait: portrait({ unit: '@brutus' }, [{ f: 400, dist: 1.05 }, { f: 449, dist: 1.05 }], { off: [-3.5, -2.2], extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S07-S10 THE FOUR CHAMPIONS (each one's ultimate)
  {
    // Avietė's Short Circuit. v3.7 (review of v3.6: in take V6 her body sank into Bruno the Cacklejaw from f456, and
    // before the cast she lay on a cadet pile): take W6, Avietė is the player; the cast on f452 strikes the two Sir
    // Brutus at the cat base and takes one down, her body clear of theirs (the take's QC-clean span after the cast);
    // the game camera looking at her, a push on the strike that eases back
    id: 'S07', ...V3, ...LITE, take: 'W6', f0: 450, f1: 499, dmgRadius: 4,
    anchor: { key: 'avieteR', frame: 452 },
    ramp: [[450, 0.88]],
    cam: onSubject({ unit: 0 }, push(450, 466, 499, 0.88)),
    portrait: portrait({ unit: 0 }, [{ f: 450, dist: 1 }, { f: 499, dist: 1 }], { wide: 1.15, extra: NOHUD }),
  },
  {
    // Bengas's Striking Pose on the bridge (take V7, Bengas is the player)
    id: 'S08', ...V3, ...LITE, take: 'V7', f0: 500, f1: 549,
    anchor: { key: 'bengasR', frame: 524 },
    cam: game(push(500, 524, 549, 0.85)),
    // v3.6: the look point further north (Bengas sat in the top fifth, under him an empty band and Sage, who read as
    // the named hero)
    // v3.7: the look point 1.8 m east (toward the bridge) and 15 % wider, so the fire ring and Duke's group stay in
    // x 0.1-0.9 (v3.6 cut them at the right edge)
    portrait: portrait({ mid: ['@bengas', '@cack'] }, push(500, 524, 549), { wide: 1.15, off: [1.8, -5.5], extra: NOHUD }),
  },
  {
    // Gabė's Under Her Spell (take V8, Gabė is the player): v3.4 the cast lands late in the shot and the cut comes
    // before the charmed Sir Brutus walks into the pile with Bengas and a cadet
    // v3.6 tags off: Gabė's channel shows the game's "Napping" status chip, which read wrong under her name card
    id: 'S09', ...V3, ...LITE, take: 'V8', f0: 550, f1: 599, tags: false,
    // v3.7 (review: Bengas, a cadet and Sir Brutus stood in one pile under GABĖ from f562): the cast on f553 and the
    // rest at 0.8x, so the shot plays the charm's payoff: Sir Brutus walking out of the pile toward Gabė
    anchor: { key: 'gabeR', frame: 553 },
    ramp: [[550, 1], [566, 0.8, 'ease']],
    cam: onSubject({ mid: ['@gabe', '@brutus'] }, push(550, 562, 599, 0.88)),
    portrait: portrait({ mid: ['@gabe', '@brutus'] }, push(550, 562, 599), { extra: NOHUD }),
  },
  {
    // Lambo's Tangled Lights (take V9): the shot ends as the lights land (before the haul pulls the bodies together)
    id: 'S10', ...V3, ...LITE, take: 'V9', f0: 600, f1: 649,
    anchor: { key: 'lamboR', frame: 645 },
    cam: onSubject({ unit: '@lambo' }, [{ f: 600, dist: 1 }, { f: 638, dist: 0.88, ease: 'ease' }, { f: 649, dist: 0.95, ease: 'ease' }]),
    portrait: portrait({ unit: '@lambo' }, [{ f: 600, dist: 1 }, { f: 645, dist: 0.9, ease: 'ease' }, { f: 649, dist: 0.9 }], { wide: 1.2, extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S11 THE MISSION 1: PUSH YOUR LANE. (take N)
  {
    // v3.4: 100 frames: the first two waves cross the Puddle Lane bridge at each other, Clem leading the cats and a Sir
    // Brutus the dogs, under a slow push; the cut lands as Clem leaps in (before the two heroes collide in the pile)
    // v3.6: the first 40 frames at 2x (easing to 1x by f715), so the waves are already running at each other under PUSH
    // YOUR LANE. (v3.5 held both waves still at the bridge ends for 1.3 s) and meet on ~f713
    id: 'S11', ...V3, ...LITE, take: 'N', f0: 650, f1: 749,
    // v3.7: 21 ticks earlier than v3.6 (Clem and Bean the Brutus met on f726 and stood inside each other to the cut):
    // the waves meet under the line (~f740) and the heroes reach each other after the cut
    anchor: { key: 'core', offset: 554.5 - 11086, frame: 650 },
    ramp: [[650, 2], [690, 2], [715, 1, 'ease']],
    cam: preset({ point: [50000, 8000] }, [{ f: 650, dist: 1 }, { f: 725, dist: 0.9, ease: 'ease' }, { f: 749, dist: 0.95, ease: 'ease' }], [0, 0]),
    // 9:16: from wider in (both waves inside the tall frame), pushing in as they meet on the bridge
    // v3.6: the bridge near the middle of the tall frame and the far lane's pile out of it
    // v3.7: 0.75x closer, on the bridge where the waves meet (v3.6 had both waves at the frame edges, specks)
    portrait: portrait({ point: [50000, 8000] }, [{ f: 650, dist: 1.15 }, { f: 700, dist: 1.0, ease: 'ease' }, { f: 749, dist: 0.85, ease: 'ease' }], { off: [0, -0.5], extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S13 THE MISSION 2: TOPPLE THEIR TOWERS. (take T1, Clem)
  {
    // Clem takes down Cacklejaw at the dog's Sunny outer tower, her cadets bring it down, and it topples east along the
    // open lane (no unit in its fall line); the game camera on the player, a push on the crack that eases back
    // v3.6: take V13 (Sage is the player): Clem hits the dog tower herself and it cracks and falls on screen (v3.5's T1
    // tower fell with nobody near it, and Clem stood in the dog bone-cart); the game camera on Sage, a push on the
    // crack that eases back
    id: 'S13', ...V3, ...LITE, take: 'V13', f0: 750, f1: 899,
    anchor: { key: 'tower', frame: 835 },
    cam: game([{ f: 750, dist: 1 }, { f: 855, dist: 0.93, ease: 'ease' }, { f: 899, dist: 1, ease: 'ease' }]),
    // 9:16: on Clem, the look point 3.5 m toward the tower (Clem and the tower share the tall frame)
    // v3.6: the look point further east (toward the tower's fall line), so its whole fall and dust stay in the frame
    portrait: portrait({ mid: [0, 1] }, [{ f: 750, dist: 1.3 }, { f: 855, dist: 1.15, ease: 'ease' }, { f: 899, dist: 1.25, ease: 'ease' }], { off: [5.5, -1.5], extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S14 KO and S14B the bridge fight (v3.7)
  ...TEAMFIGHT_SHOTS,
  // ---------------------------------------------------------------- S15 THE MISSION 3: TAKE THEIR CORE. (take V12, Bengas)
  {
    // one continuous shot: the cats win the dog base and knock the doghouse over; v3.4 the killing blow on f1318, so
    // the doghouse caves in on f1331 (CORE_HIT, the boom and VICTORY!); the bodies keep idling after the match ends
    // (heroView END_IDLE) and the camera eases on to the last frame
    id: 'S15', ...V3, ...LITE, take: 'V12', f0: 1150, f1: 1389,
    shockI: 0.45,
    popText: ['Takedown!'],
    anchor: { key: 'core', frame: 1318 },
    // v3.7 (review of v3.6: the doghouse sat on the bottom edge, the camera held still for 240 frames, and VICTORY!
    // covered the break): the look point on the doghouse itself, 4.2 m north and 3.5 m east of it, so the whole core sits on the lower-left
    // third with the heroes above it; a short push on every hit on the beat (R1 accents), then an eased push from
    // f1300 that peaks on the killing blow (f1318) and the burst (CORE_HIT, the edit's shake), easing back to the exact
    // gameplay framing by f1355
    cam: preset({ point: DOG_CORE }, S15_KEYS(1), [3.5, -4.2]),
    portrait: portrait({ point: DOG_CORE }, S15_KEYS(1.05), { off: [0.5, -6], extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S18 THE REAL CATS: the game's own pick screen (lobby)
  {
    // "Choose your legend" as the player sees it: Lambo, Avietė, Bengas, Gabė tapped on the beats; each stands at full
    // size on its cut (no grow-in); the detail panel ends after the "Inspired by <name>'s Token Tails card." line and
    // the flavour line (the ability list and the footer are not drawn: the panel shrinks to its content)
    id: 'S18', f0: 1390, f1: 1499, size: [1280, 720], dpr: 2, layers: ['hud'],
    hide: ['.pl-pick-foot', '.row.tricks', '.trick-hint', '.pl-pick .kit', '.pl-pick .lane-hint', '.pl-pick .wardrobe', '.pl-pick .pvp'],
    lobby: { stands: [{ hero: 'lambo' }], pick: { hero: 'lambo', side: 0.5, swaps: [{ f: 1415, hero: 'aviete' }, { f: 1440, hero: 'bengas' }, { f: 1465, hero: 'gabe' }] } },
    // 9:16 (v3.6): composed by the edit (PICK_916) from its own landscape capture with the lobby's glow disc left
    // out, so the backdrop is one flat colour: the edit draws the whole disc behind the hero and sets the panel, whole
    // and inside 40 px margins, below the pedestal (v3.5 cut the panel's right border and the disc at the crop edges)
    pick916: true,
    // and (v3.6) its own fixed camera: the game's pick framing cuts a tall hero's pedestal (Lambo) at the frame bottom
    portrait: { width: 1280, height: 720, dpr: 2, lobby: { hideGlow: true, pickCam: true }, cam: { target: { p3: [-2.5, 0.75, 0] }, keys: [{ f: 1390, dist: 0.38, pitch: 10, yaw: 0, fov: 38 }] } },
  },
  // ---------------------------------------------------------------- S17 LINE-UP (lobby): TEAM CAT OR TEAM DOG?
  {
    // v3.4: the two champions against the two dog heroes, Sir Brutus the dog lead (larger, nearer the centre), centred
    // with matching margins; each hero flourishes on its beat (TEAM CAT: the cats, TEAM DOG?: the dogs) under a slow
    // dolly-in; then the end card
    id: 'S17', f0: 1500, f1: 1799, size: [1280, 720], dpr: 1.5,
    lobby: {
      ped: { scale: 0.6, trim: ['#ff6f91', '#3e6ad8'] },
      fitH: 2.2,
      stands: [
        { hero: 'lambo', x: -5.0, z: 0.6, face: 20 },
        { hero: 'gabe', x: -2.1, z: 0.6, face: 20 },
        { hero: 'brutus', team: 1, x: 2.2, z: 0.9, face: -20, fitK: 1.14 },
        { hero: 'cacklejaw', team: 1, x: 5.1, z: 0.6, face: -20 },
      ],
      acts: [
        { f: 1505, stand: 0, act: 'swing' }, { f: 1509, stand: 1, act: 'swing' },
        { f: 1518, stand: 2, act: 'swing' }, { f: 1522, stand: 3, act: 'swing' },
        // v3.6: the two shield heroes (Lambo, Sir Brutus) answer with a second swing, not the cheer: the cheer's
        // raised arms held the shield out flat like a serving tray (v3.5 review, f1584)
        { f: 1550, stand: 1, act: 'cheer' }, { f: 1556, stand: 0, act: 'swing' },
        { f: 1575, stand: 3, act: 'cheer' }, { f: 1580, stand: 2, act: 'swing' },
      ],
    },
    cam: { target: { p3: [0.05, 0.85, 0.6] }, keys: [{ f: 1500, dist: 0.53, pitch: 7, yaw: 0, fov: 38 }, { f: 1600, dist: 0.5, ease: 'linear' }, { f: 1799, dist: 0.49, ease: 'linear' }] },
    portrait: {
      stands: [
        { hero: 'lambo', x: -1.9, z: -4.0, face: 14, fitK: 1.2 },
        { hero: 'gabe', x: 1.9, z: -4.0, face: -14, fitK: 1.2 },
        { hero: 'brutus', team: 1, x: -1.75, z: 2.9, face: 10, fitK: 1.08 },
        { hero: 'cacklejaw', team: 1, x: 1.75, z: 2.9, face: -10 },
      ],
      // v3.6: pulled back and the line-up raised, so TEAM DOG? has its own band under the dog pedestals (it was printed
      // across them) and Sir Brutus's pedestal clears the left edge
      cam: { target: { p3: [0, -0.2, -0.5] }, keys: [{ f: 1500, dist: 1.3, pitch: 40, yaw: 0, fov: 32 }, { f: 1600, dist: 1.26, ease: 'linear' }, { f: 1799, dist: 1.24, ease: 'linear' }] },
    },
  },
];

/** Every portrait camera is a full `portrait.cam` (capture.mjs specFor); kept for the --shots-file contract. */
export function portraitKeys(shot) {
  return shot.portrait?.cam?.keys ?? shot.cam?.keys ?? [];
}
