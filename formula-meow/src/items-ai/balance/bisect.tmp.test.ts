import { it } from 'vitest';
import { KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { playerBot } from './bots';

it('bisect', () => {
  const out: string[] = [];
  const g = globalThis as { __A?: number; __B?: number };
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    g.__A = a;
    g.__B = b;
    let podium = 0;
    const places: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const w = world(raceConfig(KITCHEN, { seed, cls: 0, humans: [5] }));
      while (!w.done) w.step([playerBot(w.ctx, 5, 0.5)]);
      const p = w.result().player.place;
      places.push(p);
      if (p <= 3) podium++;
    }
    out.push(`A=${a} B=${b} podium ${podium}/20 places ${places.join(',')}`);
  }
  g.__A = 0;
  g.__B = 0;
  require('fs').writeFileSync('/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/dbba0c29-a00d-4fad-8c19-ea74ac8d17c3/scratchpad/bisect.txt', out.join('\n'));
}, 1200000);
