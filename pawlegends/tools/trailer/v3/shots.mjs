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
const PORT_CRANE = 7.0;
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

/** v3.4 S14 + S16 (frames 900-1149): the teamfight at the dog base, then Pudding calmed (the mission's middle beat). */
const TEAMFIGHT_SHOTS = [
  {
    // Sage is the player: Bengas takes Cacklejaw down at the dog base, the cats' cart rolls up, Sir Brutus walks in
    id: 'S14', ...V3, ...LITE, take: 'F1', f0: 900, f1: 1030,
    anchor: { key: 'ko', frame: 906 },
    // v3.6: a 3° pitch accent after the KO that settles back by the cut (Bengas stood right behind Sage at f962)
    cam: game([{ f: 900, dist: 1, pitch: 0 }, { f: 912, dist: 0.93, ease: 'out' }, { f: 950, dist: 0.97, pitch: 3, ease: 'ease' }, { f: 975, pitch: 3 }, { f: 1030, dist: 1, pitch: 0, ease: 'ease' }]),
    // 9:16 (v3.6): the look point 3 m further east than v3.5 and north, on Sage and the dome entrance (the KO and the
    // dog on the right were cut by the frame edge)
    portrait: portrait({ mid: [0, 2] }, [{ f: 900, dist: 1.38 }, { f: 912, dist: 1.3, ease: 'out' }, { f: 1030, dist: 1.38, ease: 'ease' }], { off: [-1, -1.5], extra: NOHUD }),
  },
  {
    // Clem and Gabė calm Pudding on his pad, CALM PUDDING. over it; v3.6: the calm lands earlier (f1114) and the game's
    // own banner ("We calmed Pudding! He walks with our next wave.") is on from it to the cut, so the line has its
    // payoff on screen (v3.5 cut away as he shrank). The take's bodies pile up 6 frames after the cut, so the shot is
    // 119 frames (S14 takes the other 6)
    id: 'S16', ...V3, ...LITE, take: 'V11', f0: 1031, f1: 1149,
    anchor: { key: 'calm', frame: 1114 },
    bannerOn: [[1100, 1149]],
    // (v3.6: only a light push, so Pudding's pad stays clear of CALM PUDDING. in the bottom band)
    cam: game([{ f: 1031, dist: 1 }, { f: 1114, dist: 0.97, ease: 'ease' }, { f: 1149, dist: 0.98, ease: 'ease' }]),
    // 9:16 (v3.6): on Clem and Gabė with Pudding beside them (the CENTRE framing also held Avietė and Sir Brutus
    // fighting at the far bridge, their bodies overlapping)
    portrait: portrait({ mid: [0, 1] }, [{ f: 1031, dist: 0.68 }, { f: 1114, dist: 0.64, ease: 'ease' }, { f: 1149, dist: 0.66 }], { off: [2.2, 5.6], extra: NOHUD }),
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
    // 9:16 (v3.6): no orbit (yaw 0 throughout, cats left and dogs right as in every later shot): a steeper, higher
    // crane fits both bases across the tall frame, CATS over the cat side and DOGS over the dog side
    portrait: {
      ...P, ...NOHUD,
      cam: {
        target: { blend: [{ blend: [{ unit: 0 }, { point: CENTRE }], f0: 32, f1: 66 }, { unit: 0 }], f0: 103, f1: 137 },
        keys: [
          { f: 0, dist: 1.05, pitch: 48.8, fov: 50, yaw: 0, lift: 0 },
          { f: 22, dist: 0.98, ease: 'out' },
          { f: 32, dist: 1.0, pitch: 48.8, yaw: 0, ease: 'ease' },
          { f: 66, dist: PORT_CRANE, pitch: 72, yaw: 0, ease: 'ease' },
          { f: 103, dist: PORT_CRANE * 0.95, pitch: 72, yaw: 0, ease: 'linear' },
          { f: 137, dist: 1.05, pitch: 48.8, yaw: 0, ease: 'ease' },
          { f: 149, dist: 1.05, pitch: 48.8, yaw: 0 },
        ],
        smooth: 0.12,
        off: PORT_OFF,
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
    anchor: { key: 'six', offset: 8, frame: 150 },
    // the six stand apart for 130 frames of real time: the shot plays them at 0.86
    ramp: [[150, 0.86]],
    cam: game([{ f: 150, dist: 1, blend: 0.6 }, { f: 225, dist: 0.97, blend: 0.6, ease: 'ease' }, { f: 299, dist: 1, blend: 0.6, ease: 'ease' }], { mid: [0, 1, 2, 3, 4, 5] }),
    // 9:16: centred on the six (Gabė at the left end, Cacklejaw at the right), pulled out so all of them fit
    // v3.6: on the centroid of all six (v3.5's midpoint of two left Gabė and Bolt the Brutus half off the left edge)
    portrait: portrait({ mid: [0, 1, 2, 3, 4, 5] }, [{ f: 150, dist: 1.42, pitch: 55 }, { f: 299, dist: 1.36, pitch: 55, ease: 'linear' }], { extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S03-S06 THE RIVALRY (cat, dog, dog)
  {
    // Clem's Tumble at Sir Brutus by the dog tower (take V2, Clem is the player)
    id: 'S03', ...V3, ...LITE, take: 'V2', f0: 300, f1: 349,
    anchor: { key: 'e', frame: 324 },
    cam: game(push(300, 324, 349)),
    portrait: portrait({ mid: ['@clem', '@brutus'] }, push(300, 324, 349), { wide: 1.1, extra: NOHUD }),
  },
  {
    // the dogs answer: Cacklejaw's Pack Hunt on Gabė at the cat-side bridge (take V3; v3.3's Z1 window had Lambo's
    // flop snap through him)
    id: 'S04', ...V3, ...LITE, take: 'V3', f0: 350, f1: 399,
    anchor: { key: 'cackR', frame: 360 },
    cam: onSubject({ mid: ['@cack', '@gabe'] }, push(350, 366, 399, 0.94)),
    portrait: portrait({ mid: ['@cack', '@gabe'] }, push(350, 366, 399, 0.94), { wide: 1.1, extra: NOHUD }),
  },
  {
    // Sir Brutus's Champion's Challenge (take V5): no push (its ring is large and pale)
    id: 'S06', ...V3, ...LITE, take: 'V5', f0: 400, f1: 449,
    anchor: { key: 'brutusR', frame: 420 },
    cam: onSubject({ unit: '@brutus' }, [{ f: 400, dist: 1 }, { f: 449, dist: 1 }]),
    portrait: portrait({ unit: '@brutus' }, [{ f: 400, dist: 1.05 }, { f: 449, dist: 1.05 }], { extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S07-S10 THE FOUR CHAMPIONS (each one's ultimate)
  {
    // Avietė's Short Circuit (take V6): from the cast (before it she lay on a cadet pile), 0.88 speed
    // v3.6 dmgRadius: a far damage counter merged across the frame on the first frame (a one-frame stray "234")
    id: 'S07', ...V3, ...LITE, take: 'V6', f0: 450, f1: 499, dmgRadius: 4,
    anchor: { key: 'avieteR', frame: 451 },
    ramp: [[450, 0.88]],
    cam: onSubject({ unit: '@aviete' }, push(450, 470, 499, 0.92)),
    portrait: portrait({ unit: '@aviete' }, push(450, 470, 499, 0.92), { wide: 1.1, extra: NOHUD }),
  },
  {
    // Bengas's Striking Pose on the bridge (take V7, Bengas is the player)
    id: 'S08', ...V3, ...LITE, take: 'V7', f0: 500, f1: 549,
    anchor: { key: 'bengasR', frame: 524 },
    cam: game(push(500, 524, 549)),
    // v3.6: the look point further north (Bengas sat in the top fifth, under him an empty band and Sage, who read as
    // the named hero)
    portrait: portrait({ mid: ['@bengas', '@cack'] }, push(500, 524, 549), { off: [0, -5.5], extra: NOHUD }),
  },
  {
    // Gabė's Under Her Spell (take V8, Gabė is the player): v3.4 the cast lands late in the shot and the cut comes
    // before the charmed Sir Brutus walks into the pile with Bengas and a cadet
    // v3.6 tags off: Gabė's channel shows the game's "Napping" status chip, which read wrong under her name card
    id: 'S09', ...V3, ...LITE, take: 'V8', f0: 550, f1: 599, tags: false,
    anchor: { key: 'gabeR', frame: 590 },
    cam: onSubject({ mid: ['@gabe', '@brutus'] }, push(550, 590, 599)),
    portrait: portrait({ mid: ['@gabe', '@brutus'] }, push(550, 590, 599), { extra: NOHUD }),
  },
  {
    // Lambo's Tangled Lights (take V9): the shot ends as the lights land (before the haul pulls the bodies together)
    id: 'S10', ...V3, ...LITE, take: 'V9', f0: 600, f1: 649,
    anchor: { key: 'lamboR', frame: 645 },
    cam: onSubject({ unit: '@lambo' }, [{ f: 600, dist: 1 }, { f: 645, dist: 0.94, ease: 'ease' }, { f: 649, dist: 0.95 }]),
    portrait: portrait({ unit: '@lambo' }, [{ f: 600, dist: 1 }, { f: 645, dist: 0.9, ease: 'ease' }, { f: 649, dist: 0.9 }], { wide: 1.2, extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S11 THE MISSION 1: PUSH YOUR LANE. (take N)
  {
    // v3.4: 100 frames: the first two waves cross the Puddle Lane bridge at each other, Clem leading the cats and a Sir
    // Brutus the dogs, under a slow push; the cut lands as Clem leaps in (before the two heroes collide in the pile)
    // v3.6: the first 40 frames at 2x (easing to 1x by f715), so the waves are already running at each other under PUSH
    // YOUR LANE. (v3.5 held both waves still at the bridge ends for 1.3 s) and meet on ~f713
    id: 'S11', ...V3, ...LITE, take: 'N', f0: 650, f1: 749,
    anchor: { key: 'core', offset: 575.5 - 11086, frame: 650 },
    ramp: [[650, 2], [690, 2], [715, 1, 'ease']],
    cam: preset({ point: [50000, 8000] }, [{ f: 650, dist: 1 }, { f: 725, dist: 0.9, ease: 'ease' }, { f: 749, dist: 0.95, ease: 'ease' }], [0, 0]),
    // 9:16: from wider in (both waves inside the tall frame), pushing in as they meet on the bridge
    // v3.6: the bridge near the middle of the tall frame and the far lane's pile out of it
    portrait: portrait({ point: [50000, 8000] }, [{ f: 650, dist: 1.25 }, { f: 749, dist: 1.05, ease: 'ease' }], { off: [0, 1.0], extra: NOHUD }),
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
    portrait: portrait({ mid: [0, 1] }, [{ f: 750, dist: 1.3 }, { f: 855, dist: 1.15, ease: 'ease' }, { f: 899, dist: 1.25, ease: 'ease' }], { off: [3, -1.5], extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S14 TEAMFIGHT and S16 CALM PUDDING. (v3.4)
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
    // v3.6 (review: the biggest beat had the flattest camera, the heroes squeezed under the score bar): the look point
    // 2.6 m further north; a push to 0.85 into the burst, the edit's shake on it, then a 9° yaw and 5° pitch accent
    // over 25 frames that eases back to the gameplay view (yaw 0, distance 1) by f1375, held to the cut
    cam: preset({ unit: 0 }, [{ f: 1150, dist: 1 }, { f: 1205, dist: 1 }, { f: 1318, dist: 0.9, ease: 'ease' }, { f: 1331, dist: 0.85, ease: 'out' }, { f: 1352, dist: 0.88, yaw: -9, pitch: 53.8, ease: 'ease' }, { f: 1375, dist: 1, yaw: 0, pitch: 48.8, ease: 'ease' }, { f: 1389, dist: 1 }], [-1.5, -0.2]),
    portrait: portrait({ unit: 0 }, [{ f: 1150, dist: 1.1 }, { f: 1205, dist: 1.1 }, { f: 1318, dist: 1.0, ease: 'ease' }, { f: 1331, dist: 0.95, ease: 'out' }, { f: 1352, dist: 0.98, yaw: -9, pitch: 53.8, ease: 'ease' }, { f: 1375, dist: 1.1, yaw: 0, pitch: 48.8, ease: 'ease' }, { f: 1389, dist: 1.1 }], { off: [-1.5, -0.6], extra: NOHUD }),
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
