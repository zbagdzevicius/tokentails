// @vitest-environment happy-dom
/**
 * Launch finding ftue-2: the match-2 ping tip is a long banner (`hold`), and the session can tell whether it is on
 * screen (`showing`) or still waiting (`queued`), so a stale or overflow drop from the queue does not lose it.
 */
import { describe, expect, it } from 'vitest';
import { Juice } from '../../src/render/juice';

describe('ftue-2: banner hold and on-screen state', () => {
  it('a banner with `hold` stays up that long; an ordinary one 2.1 s', () => {
    const j = new Juice(document.body);
    j.banner({ title: 'Tell your team what to do', sub: 'Hold G for orders.', hold: 5.5 });
    expect(j.queued('Tell your team what to do')).toBe(true);
    expect(j.showing).toBe('');
    j.update(0.016);
    expect(j.showing).toBe('Tell your team what to do');
    expect(j.queued('Tell your team what to do')).toBe(false);
    expect(document.documentElement.dataset.banner).toBe('Tell your team what to do');
    j.update(5);
    expect(j.showing).toBe('Tell your team what to do');
    j.update(0.6);
    expect(j.showing).toBe('');

    j.update(0.4); // the fade gap
    j.banner({ title: 'Frenzy Catnip in the river!' });
    j.update(0.016);
    expect(j.showing).toBe('Frenzy Catnip in the river!');
    j.update(2.2);
    expect(j.showing).toBe('');
    j.dispose();
  });

  it('an overflow drop leaves the banner neither queued nor showing (the session queues it again)', () => {
    const j = new Juice(document.body);
    j.banner({ title: 'Tell your team what to do', hold: 5.5 });
    j.banner({ title: 'A' });
    j.banner({ title: 'B' });
    j.banner({ title: 'C' });
    expect(j.queued('Tell your team what to do')).toBe(false);
    expect(j.showing).toBe('');
    j.dispose();
  });
});
