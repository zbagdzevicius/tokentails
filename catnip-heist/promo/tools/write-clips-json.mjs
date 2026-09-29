import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const log = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'capture-log.json'), 'utf8'));
const D = {
  'h08-establish': 'Wide establishing shot of heist-08 Kibble Corp HQ (40x27, whole map visible): camera locked on the map centre, slow ease-out push-in (view height 30 -> 21 tiles) over the clip. Five guard dogs patrol with glowing yellow vision cones, exit portal top-left, crate cage centre-right, city skyline below. Sim ticks 201-350. f1 swap to cat 2 (ring pulse), f4 plate released/door closes, f148 coin pickup.',
  'h01-plate-swap': 'heist-01 Warehouse, follow cam. HOLD THE DOOR + SWAP: f16 cat steps on the pressure plate and the plate door slides open, f19 SWAP (camera glides to the other cat, gold ring pulse), second cat walks through the held door, f130 plate pressed again, f134 SWAP back, f137 plate released.',
  'h02-meow-lure': 'heist-02 Kennel Row. MEOW: f22 coin pickup, f43 MEOW (pink shockwave rings expand from the black cat) and the doorman dog gets a "?" and walks off its post to investigate (cone turns orange), f60-110 cat slips past behind it, f124 coin pickup.',
  'h05-coin-run': 'heist-05 Watchtower Yard from the level start (tick 0). Coin run past turning sentries: coin pickups (catnip sparkle + zoom punch) at f15, f64, f82, f124, f142. Sentry cones rotate on schedule.',
  'h04-key-doors': 'heist-04 Counting House. Rapid swap timing: SWAPs at f5, f24, f43, f62; plate door opens f21 and closes f46; coins f65, f84, f95; KEY picked up at f102 (gold burst). Fast patrol loop nearby.',
  'h08-vault-rescue': 'heist-08 HQ finale. f16 VAULT door opens with the key, coin pickups f32, f50, f80, f113 RESCUE: shelter cat freed from its crate (big white flash + confetti burst + hearts), crate bursts open.',
  'h02-rescue-exit': 'heist-02. f9 coin, f19 RESCUE (crate opens, flash + confetti), freed cat follows; coins f53, f83; f101 checkpoint; coins f112, f130; heading toward the exit portal (swirl) at the end.',
  'h05-rescue-exit': 'heist-05. Coins f6, f19; f34 RESCUE (crate flash + confetti next to the EXIT sign and swirling portal); f65 SWAP; f68 WIN: both cats in the exit portal, celebration particles; f69-120 win celebration continues (sim finished, render keeps animating).',
  'h06-sneak-corridor': 'heist-06 Conveyor Halls. SNEAK: cat threads the 1-tile corridors and niches between fast pacer dogs (vision cones sweeping close); coins f40, f82; f100 plate pressed; f104 SWAP.',
  'h07-split-shift': 'heist-07 Split Shift: two wings, doors opened from the other wing. f1 coin, f13 plate+door open, f16 SWAP, f19 door closes, f53 SWAP, f78 SWAP, f105 coin, f135 door open, f141 door close, f148 coin. Lots of swapping cross-cutting.',
  'h02-spotted': 'heist-02 live run fed with the solution inputs but WITHOUT the meow, so the doorman never leaves: f1-103 black cat approaches the yellow cone (f103 at the cone edge), f104 SPOTTED: full-screen red alert flash, cone turns red, guard shows red "!", cat is sent back to its checkpoint (camera jumps); f105-125 red flash fades; f126-150 cat recovering at checkpoint, guard in ALERT.',
  'h01-hud': 'Same shot as h01-plate-swap (heist-01, ticks 151-300) but WITH the game DOM HUD: coin counter, timer, spotted counter, cat portraits with "you" tag, objective banner, REPLAY badge, sound/pause buttons. Same key moments: f16 plate/door open, f19 SWAP, f134 SWAP.',
  'yard-wander': 'Cat Yard (not a heist): isometric garden with fountain, flower beds, lamps; all 58 breeds wander, sit and groom. 120 frames, no HUD. Good for the BREEDS bar.',
};
const clips = [];
for (const name of Object.keys(D)) {
  const dir = `assets/clips/${name}`;
  const frames = fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.jpg')).length;
  const l = log[name];
  const clip = { name, dir, frames, fps: 30, width: 1920, height: 1080, level: l ? l.def.level : 'yard', description: D[name], hud: name === 'h01-hud' };
  if (l) {
    clip.simTicks = [l.ticks[0].tick, l.ticks[l.ticks.length - 1].tick];
    clip.events = l.ticks.filter(t => t.ev?.length && !(t.won && l.ticks[t.f - 2]?.won)).flatMap(t => t.ev.map(e => ({ frame: t.f, type: e.replace(/[+-]$/, ''), ...(e.endsWith('+') ? { open: true } : e.endsWith('-') ? { open: false } : {}) })));
  }
  clips.push(clip);
}
fs.writeFileSync(path.join(ROOT, 'assets/clips/clips.json'), JSON.stringify(clips, null, 2));
const stills = fs.readdirSync(path.join(ROOT, 'assets/clips/stills'));
console.log(clips.map(c => `${c.name} ${c.frames}`).join('\n'), '\nstills:', stills.join(', '));
