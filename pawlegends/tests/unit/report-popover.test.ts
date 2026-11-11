// @vitest-environment happy-dom
/**
 * The PvP report button (docs/plans/moba/SOCIAL-RANKED.md §8): flags only on other humans' rows, one tap opens the
 * reason chips, one tap on a chip sends (no confirm), the flag is checked after and a second report is never sent. The
 * reason list mirrors the backend's.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeReportPopover, REPORT_REASONS, ReportBook, reportOutcomeOf, reportPopover, reportable } from '../../src/social/report';
import { Scoreboard } from '../../src/ui/scoreboard';
import { resultsScreen } from '../../src/ui/screens';

afterEach(() => {
  closeReportPopover();
  document.body.innerHTML = '';
});

describe('report reasons', () => {
  it('mirror backend/src/pawlegends/social/report.contracts.ts', () => {
    const src = readFileSync(resolve(__dirname, '../../../backend/src/pawlegends/social/report.contracts.ts'), 'utf8');
    const m = /REPORT_REASONS = \[([^\]]+)\]/.exec(src);
    expect(m).toBeTruthy();
    expect(m![1].split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual([...REPORT_REASONS]);
  });
});

describe('report book', () => {
  it('sends once per slot; a failure frees the flag for a retry', async () => {
    const send = vi.fn().mockResolvedValueOnce('failed').mockResolvedValue('sent');
    const book = new ReportBook('r1', send);
    expect(await book.report(3, 'afk', 90)).toBe('failed');
    expect(book.done(3)).toBe(false);
    expect(await book.report(3, 'afk', 90)).toBe('sent');
    expect(book.done(3)).toBe(true);
    expect(await book.report(3, 'grief', 91)).toBe('already');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('maps api answers', () => {
    expect(reportOutcomeOf({ ok: true, status: 201 })).toBe('sent');
    expect(reportOutcomeOf({ ok: true, status: 200 })).toBe('already');
    expect(reportOutcomeOf({ ok: false, status: 429 })).toBe('failed');
    expect(reportOutcomeOf({ ok: false, status: 0 })).toBe('failed');
  });

  it('flags only named (human) seats that are not yours', () => {
    const names = ['Me', null, null, 'Foe', null, 'Mate'];
    expect([0, 1, 2, 3, 4, 5].filter((s) => reportable(s, 0, names))).toEqual([3, 5]);
  });
});

describe('scoreboard flag', () => {
  const picks = ['clem', 'sage', 'brutus', 'gabe', 'pixel', 'stilts'] as never;

  it('no flag on bots or your own row; one tap opens the chips, one chip sends', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const sb = new Scoreboard(parent, picks, 0, ['Me', 'Bot A', 'Bot B', 'Foe', 'Bot C', 'Bot D']);
    const book = new ReportBook('r1', vi.fn().mockResolvedValue('sent'));
    const humans = ['Me', null, null, 'Foe', null, null];
    let opened: number | null = null;
    sb.report = {
      can: (slot) => reportable(slot, 0, humans),
      done: (slot) => book.done(slot),
      open: (slot, anchor) =>
        void reportPopover(anchor, 'Foe', (reason) => {
          opened = slot;
          void book.report(slot, reason, 100);
        }),
    };
    sb.show(true, null);
    const flags = [...parent.querySelectorAll<HTMLElement>('[data-report]')];
    expect(flags.map((f) => f.dataset.report)).toEqual(['3']);
    flags[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const chips = [...document.querySelectorAll<HTMLElement>('.pl-report-chip')];
    expect(chips.map((c) => c.dataset.reason)).toEqual([...REPORT_REASONS]);
    chips[2].click();
    expect(document.querySelector('.pl-report-pop')).toBeNull();
    await Promise.resolve();
    expect(opened).toBe(3);
    sb.show(true, null);
    const done = parent.querySelector<HTMLElement>('[data-report="3"]')!;
    expect(done.hasAttribute('disabled')).toBe(true);
    sb.dispose();
  });

  it('outside PvP there are no flags', () => {
    const parent = document.createElement('div');
    const sb = new Scoreboard(parent, picks, 0);
    sb.show(true, null);
    expect(parent.querySelector('[data-report]')).toBeNull();
  });
});

describe('results flag', () => {
  it('rows with a flag call onReport with the slot', () => {
    const onReport = vi.fn();
    const root = resultsScreen(document.body, {
      won: true,
      seconds: 400,
      hero: 'clem',
      difficulty: 'hard',
      kills: 1,
      deaths: 0,
      level: 5,
      teamKills: [3, 2],
      firstWin: false,
      best: false,
      dareLink: null,
      onAgain: () => undefined,
      onChange: () => undefined,
      onShare: () => undefined,
      onReport,
      table: [
        { name: 'Me', rel: 'self', k: 1, d: 0, a: 0, heroDmg: 10, towerDmg: 0 },
        { name: 'Foe', rel: 'enemy', k: 0, d: 1, a: 0, heroDmg: 5, towerDmg: 0, slot: 3, flag: 'can' },
        { name: 'Bot', rel: 'enemy', k: 0, d: 1, a: 0, heroDmg: 5, towerDmg: 0 },
      ],
    });
    const flags = root.querySelectorAll<HTMLElement>('[data-report]');
    expect(flags).toHaveLength(1);
    flags[0].click();
    expect(onReport).toHaveBeenCalledWith(3, flags[0]);
  });
});
