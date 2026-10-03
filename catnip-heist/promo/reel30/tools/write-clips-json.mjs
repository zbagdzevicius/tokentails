// Writes ../assets/clips/clips.json from capture-log.json (+ the hand-written descriptions below).
// All gameplay clips were captured from the CURRENT Heist build (current botanical catnip sprig,
// current level layouts/solutions); the 15 s reel's clip names are kept with re-found key moments.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const log = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'capture-log.json'), 'utf8'));
const NAMES = { 'heist-01': 'Kibble Corp Warehouse', 'heist-02': 'Kennel Row', 'heist-03': 'Twin Locks', 'heist-04': 'Counting House', 'heist-05': 'Watchtower Yard', 'heist-06': 'Conveyor Halls', 'heist-07': 'Split Shift', 'heist-08': 'Kibble Corp HQ' };
const IDEA = { 'heist-01': 'Tutorial: move, sneak, swap, plate door', 'heist-02': 'Meow to lure a doorman off its post', 'heist-03': 'Chained plate doors, swap timing', 'heist-04': 'Key + vault with a fast patrol loop', 'heist-05': 'Sentries that turn on a schedule', 'heist-06': 'Tight patrol timing in 1-tile corridors with niches', 'heist-07': "Split up: each wing's doors are opened from the other wing", 'heist-08': 'Finale: all of the above' };
const SHELTER = { 'heist-01': 'Mochi (siamese)', 'heist-02': 'Biscuit (cheesy)', 'heist-03': 'Luna (mist)', 'heist-04': 'Pumpkin (peachies)', 'heist-05': 'Juniper (olive)', 'heist-06': 'Waffles (maine)', 'heist-07': 'Nimbus (grey)', 'heist-08': 'Clover (white)' };
const RESCUE_NOTE = 'RESCUE in the current build: rescue flash tint on the RESCUE frame, then the crate opens with a pink heart/confetti burst about 4-6 frames later and the freed shelter cat hops out and follows the cats.';
const D = {};
for (let i = 1; i <= 8; i++) {
  const lv = 'heist-0' + i;
  D['lvl-0' + i] = `LEVEL ROLL-CALL ${i}/8: heist-0${i} "${NAMES[lv]}" (${IDEA[lv]}). Wide establishing shot, camera locked on the map centre, whole map visible over the night skyline, slow ease-out push-in (cubic) over 60 frames. Shelter cat in the crate: ${SHELTER[lv]}. Guard dogs with yellow vision cones, catnip sprigs, EXIT portal visible. Solution replay running (cats moving).`;
}
Object.assign(D, {
  'h03-twin-locks': 'heist-03 Twin Locks, follow cam. CHAINED PLATES: f15 cat steps on the pink plate, door slides open; f18 SWAP (camera glides to the other cat, gold ring); f57 plate pressed by the second cat, f61 SWAP back, f64 plate released. Checkpoint pads f51, f118; coin f148.',
  'h03-chain-swap': 'heist-03 Twin Locks, later chain: f11 plate+door open, f15 SWAP, f18 door closes behind; f121 plate, f124 SWAP, f127 plate released. EXIT sign and crate area in view early.',
  'h03-rescue-exit': `heist-03 Twin Locks ending: f5 coin, f21 RESCUE (Luna freed), f52 SWAP, f53 WIN: both cats in the exit portal; f54-120 win celebration (big confetti fountain + rings, sim finished). ${RESCUE_NOTE}`,
  'h01-rescue': `heist-01 Warehouse: f26 RESCUE of Mochi (siamese). ${RESCUE_NOTE} f40-90 freed cat follows the active cat out past the guard cones.`,
  'h04-rescue': `heist-04 Counting House: f9 coin, f25 RESCUE of Pumpkin, f89 coin. ${RESCUE_NOTE}`,
  'h08-rescue': `heist-08 HQ: f28 RESCUE of Clover (white), f53 SWAP; doorman dog with "?" (investigating, orange cone) on the left. ${RESCUE_NOTE}`,
  'h06-rescue-exit': `heist-06 Conveyor Halls: f22 RESCUE of Waffles, f35 SWAP, f38 door closes, f60 WIN (both cats at the exit, confetti fountain); f61-120 celebration. ${RESCUE_NOTE}`,
  'h07-rescue-exit': `heist-07 Split Shift: f21 RESCUE of Nimbus, f40 SWAP, f43 door closes, f65 WIN (confetti fountain + rings); f66-120 celebration.`,
  'h02-win': 'heist-02 Kennel Row end: f14 checkpoint, f25 coin, f48 WIN at the exit portal (confetti fountain); f49-100 celebration.',
  'h08-establish': 'Wide establishing shot of heist-08 Kibble Corp HQ (40x27): camera locked on the map centre, slow ease-out push-in (view height 30 -> 21 tiles). Five guard dogs with yellow vision cones, exit portal top-left, crate centre-right, city skyline below. f1 SWAP ring, f4 door closes, f148 coin.',
  'h01-plate-swap': 'heist-01 Warehouse, follow cam. HOLD THE DOOR + SWAP: f16 cat steps on the pressure plate and the plate door slides open, f19 SWAP (camera glides to the other cat, gold ring pulse), second cat walks through the held door, f118 checkpoint, f130 plate pressed again, f134 SWAP back, f137 plate released.',
  'h01-hud': 'Same shot as h01-plate-swap (heist-01 ticks 151-300) WITH the game DOM HUD (catnip counter, timer, spotted counter, cat portraits, objective chip, REPLAY badge). f16 plate/door, f19 SWAP, f134 SWAP.',
  'h02-meow-lure': 'heist-02 Kennel Row. MEOW: f22 coin, f43 MEOW (rings expand from the black cat) and the doorman dog gets a "?" and walks off its post to investigate (cone turns orange), f60-110 cat slips past behind it, f124 coin.',
  'h02-spotted': 'heist-02 live run fed the solution inputs but WITHOUT the meow, so the doorman stays: f17 coin, f1-103 black cat approaches the cone, f104 SPOTTED: full-screen red alert flash, cone turns red, "!" on the guard, cat sent back to its checkpoint (camera jumps); f105-125 red fades; f126-150 cat at its checkpoint (grace flicker).',
  'h02-rescue-exit': `heist-02: f9 coin, f19 RESCUE of Biscuit, freed cat follows; coins f53, f83, f107; f149 checkpoint, heading to the exit. ${RESCUE_NOTE}`,
  'h04-key-doors': 'heist-04 Counting House. Rapid swap timing: SWAPs f6, f25, f44, f63; plate door opens f22, closes f47; coins f66, f85, f96; KEY picked up at f103 (gold burst).',
  'h05-coin-run': 'heist-05 Watchtower Yard from the level start (tick 0). Coin run past turning sentries: catnip pickups (sparkle + zoom punch) f15, f64, f82, f124, f142. Sentry cones rotate on schedule (ghost-cone telegraph before turns).',
  'h05-rescue-exit': `heist-05: coins f6, f19; f34 RESCUE of Juniper next to the EXIT sign and swirling portal; f65 SWAP; f66 WIN (both cats in the portal, confetti fountain); f67-120 celebration. ${RESCUE_NOTE}`,
  'h06-sneak-corridor': 'heist-06 Conveyor Halls. SNEAK: cats thread the 1-tile corridors and niches between fast pacer dogs (cones sweeping close; tall walls, cones drawn x-ray); f78 coin; f96 plate pressed; f100 SWAP; f104 plate released.',
  'h07-split-shift': 'heist-07 Split Shift: two wings, doors opened from the other wing. f3 coin, f15 plate+door open, f18 SWAP, f21 door closes, f51 checkpoint, f55 SWAP, f58 door closes, f80 SWAP, f113 coin.',
  'h08-vault-rescue': `heist-08 HQ finale: f16 VAULT door opens with the key, coins f32, f50, f80, f113 RESCUE of Clover (white); doorman dog investigating ("?", orange cone) on the left. ${RESCUE_NOTE}`,
  'yard-wander': 'Cat Yard (not a heist): isometric garden with fountain, flower beds, lamps; all 58 breeds wander, sit and groom. 120 frames, no HUD. Real-time (not sim-stepped).',
  // On-chain surfaces (UI captures). Token tickers and wallet addresses are blurred in place (span with blur(9px)); no chain names render.
  'oc-payouts-open': 'ON-CHAIN (Heist): the "Sent to shelters" modal over the title screen. Pill "PUBLIC, ON-CHAIN", title "SENT TO SHELTERS", glowing "First payouts land soon", "Each one will show up here the moment it happens, with a link to check it on the chain.", HOW IT WORKS 1-2-3, SHOWCASE SHELTER card "PINK PAW (ROŽINĖ PĖDUTĖ)" with "Goal: 90 [ticker blurred] for Pink Paw by 31 Jan 2027", "Real shelter treats open soon.", "OPENS SOON" chip, BACK TO THE HEIST button. The CSS pop-in ran in real time, so all 60 frames show the modal fully open (static; animate it in the reel). Clean still: stills/oc-payouts-modal.jpg.',
  'oc-results-rescue': 'ON-CHAIN tie-in (Heist win screen) of a LIVE heist-05 run: f1 dark transition frame, f2-12 the "HEIST COMPLETE!" card slides in, f12-40 rows fill and three gold stars pop; card text: "You rescued Juniper!" (shelter cat portrait), "Real shelter treats open soon.", "OPENS SOON" chip, "SEE SHELTER PAYOUTS" pill; Catnip 19/19 x 10 +190, Shelter cat rescued +50, Time 0:30 (par 1:00) -3, Spotted 0x, Score 237; "Heist complete · All catnip · Clean and quick", "Unlocked: Conveyor Halls"; confetti behind. Settled still: stills/oc-results.jpg.',
  'oc-web-payouts': 'ON-CHAIN (tokentails.com /shelter-payouts, local client): 90-frame eased scroll from the hero ("LIVE FROM THE CHAIN" pill, "SHELTER PAYOUTS", glowing "First payout soon", "Every payout from the ShelterSplit contract is read live from the chain\'s public RPC, not from our servers.", SEND A TREAT, "Shelter wallet held by Token Tails on behalf of the shelter until handover") down to the showcase card ("WHERE YOUR TREATS LAND FIRST.", Pink Paw pixel cat, WALLET [address blurred], HANDOVER, "PINK PAW AUTUMN RESCUE since 2026-10-02", "0 / 90 [ticker blurred]", "0 of 90 [blurred] raised on-chain"). Real-time page (star field animates). Stills: oc-web-payouts-top/-mid/-full.jpg.',
  'oc-web-give': 'ON-CHAIN (tokentails.com /shelter-payouts/give?from=heist&cat=Juniper, local client): "RESCUE COMPLETE" pill, Pink Paw portrait, "JUNIPER IS SAFE!", "SEND A TREAT TO PINK PAW (ROŽINĖ PĖDUTĖ)", "One tap and Token Tails sends a small [ticker blurred] treat to the shelter through the ShelterSplit contract. It\'s on us, and it\'s public on the chain.", "EACH TREAT: 0.01 [blurred]", disabled "SEND PINK PAW A RESCUE TREAT" button, "The treat jar is closed for now. Check back soon.", "SEE EVERY PAYOUT ON THE CHAIN". 90-frame scroll to the footer. Stills: oc-web-give-top/-mid/-full.jpg.',
});
const clips = [];
for (const name of Object.keys(D)) {
  const dir = `assets/clips/${name}`;
  if (!fs.existsSync(path.join(ROOT, dir))) { console.log('missing', name); continue; }
  const frames = fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.jpg')).length;
  const l = log[name];
  const level = l ? l.def.level : name.startsWith('oc-') ? 'ui' : 'yard';
  const clip = { name, dir, frames, fps: 30, width: 1920, height: 1080, level, ...(NAMES[level] ? { levelName: NAMES[level] } : {}), kind: name.startsWith('lvl-') ? 'level-establish' : name.startsWith('oc-') ? 'onchain-ui' : name === 'yard-wander' ? 'yard' : 'gameplay', description: D[name], hud: name === 'h01-hud' || name.startsWith('oc-'), build: 'current' };
  if (name.startsWith('oc-')) clip.redacted = 'token tickers and wallet addresses blurred in place; no chain names on screen';
  if (l) {
    clip.simTicks = [l.ticks[0].tick, l.ticks[l.ticks.length - 1].tick];
    clip.events = l.ticks.filter(t => t.ev?.length && !(t.won && l.ticks[t.f - 2]?.won)).flatMap(t => t.ev.map(e => ({ frame: t.f, type: e.replace(/[+-]$/, ''), ...(e.endsWith('+') ? { open: true } : e.endsWith('-') ? { open: false } : {}) })));
  }
  clips.push(clip);
}
fs.writeFileSync(path.join(ROOT, 'assets/clips/clips.json'), JSON.stringify(clips, null, 2));
const stills = fs.readdirSync(path.join(ROOT, 'assets/clips/stills'));
console.log(clips.map(c => `${c.name} ${c.frames}`).join('\n'), '\nstills:', stills.join(', '));
