// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TREAT_CUSTODY, TREAT_PANEL_STATES, createTreatController, createTreatPanel, treatLine, type TreatPanelState } from '../treat';
import type { RailInfo } from '../rail';
import type { TreatOutcome, TreatSender, TreatToday } from '../../embed/treat-bridge';

const RAIL: RailInfo = { state: 'live', amountUsdc: '0.01', source: 'status', chainId: 5042 };
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeSender(today: TreatToday, outcomes: TreatOutcome[]): TreatSender & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    mode: 'direct',
    calls,
    today: async () => today,
    send: async (req) => {
      calls.push(req);
      return outcomes.shift() ?? { kind: 'failed' };
    },
  };
}

describe('treat panel', () => {
  let hrefBefore = '';
  let openSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    document.body.innerHTML = '';
    hrefBefore = location.href;
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });
  afterEach(() => {
    // The game tab never moves and never opens anything itself.
    expect(location.href).toBe(hrefBefore);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  const mount = (sender: TreatSender | null, web = true, custody?: boolean) => {
    const controller = createTreatController({ sender, rail: () => RAIL });
    const panel = createTreatPanel({ controller, rail: () => RAIL, web, catName: () => 'Judas', custody });
    document.body.append(panel.el);
    const q = (id: string) => panel.el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return { controller, panel, q, state: () => panel.el.dataset.state as TreatPanelState };
  };

  it('checking, then ready; a tap sends once with the chain and the cat, and shows the receipt in a new tab', async () => {
    const sender = fakeSender('none', [{ kind: 'sent', receipt: 'https://arcscan.app/tx/0xabc' }]);
    const m = mount(sender);
    expect(m.state()).toBe('checking');
    expect((m.q('give-treat') as HTMLButtonElement).disabled).toBe(true);
    await flush();
    expect(m.state()).toBe('ready');
    const btn = m.q('give-treat') as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.hasAttribute('href')).toBe(false);
    expect(btn.getAttribute('type')).toBe('button');
    btn.click();
    expect(m.state()).toBe('sending');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    btn.click(); // a double tap is ignored
    await flush();
    expect(sender.calls).toEqual([{ chainId: 5042, cat: 'Judas' }]);
    expect(m.state()).toBe('sent');
    expect(m.q('treat-line')?.textContent).toBe('Treat sent! Token Tails sent Pink Paw a free 0.01 USDC treat.');
    const receipt = m.q('treat-receipt') as HTMLAnchorElement;
    expect(receipt.getAttribute('href')).toBe('https://arcscan.app/tx/0xabc');
    expect(receipt.target).toBe('_blank');
    expect(receipt.rel).toContain('noopener');
    expect(btn.hidden).toBe(true);
    expect(m.q('treat-custody')?.textContent).toBe(TREAT_CUSTODY);
  });

  it('app builds get no receipt link and no coin words', async () => {
    const m = mount(fakeSender('none', [{ kind: 'sent', receipt: 'https://arcscan.app/tx/0xabc' }]), false);
    await flush();
    (m.q('give-treat') as HTMLButtonElement).click();
    await flush();
    expect(m.q('treat-receipt')).toBeNull();
    expect(m.q('treat-line')?.textContent).toBe('Treat sent! Token Tails sent Pink Paw a free $0.01 treat.');
    expect(m.panel.el.textContent).not.toMatch(/USDC|Arc|chain|wallet/);
  });

  it('already sent today (from the read) shows no button', async () => {
    const m = mount(fakeSender('sent', []));
    await flush();
    expect(m.state()).toBe('already');
    expect((m.q('give-treat') as HTMLButtonElement).hidden).toBe(true);
    expect(m.q('treat-line')?.textContent).toBe("Today's treat already went out. Back at 00:00 UTC.");
  });

  it.each([
    [{ kind: 'already' }, 'already', "Today's treat already went out. Back at 00:00 UTC."],
    [{ kind: 'used-up' }, 'used-up', "Today's treats are gone, back at 00:00 UTC."],
    [{ kind: 'paused' }, 'paused', 'Treats are paused right now.'],
  ] as const)('a send answered %o ends in %s', async (outcome, state, line) => {
    const m = mount(fakeSender('none', [outcome as TreatOutcome]));
    await flush();
    (m.q('give-treat') as HTMLButtonElement).click();
    await flush();
    expect(m.state()).toBe(state);
    expect(m.q('treat-line')?.textContent).toBe(line);
    expect((m.q('give-treat') as HTMLButtonElement).hidden).toBe(true);
    expect(m.q('treat-custody')?.textContent).toBe(TREAT_CUSTODY);
  });

  it('failed offers a retry that sends again', async () => {
    const sender = fakeSender('none', [{ kind: 'failed' }, { kind: 'sent' }]);
    const m = mount(sender);
    await flush();
    (m.q('give-treat') as HTMLButtonElement).click();
    await flush();
    expect(m.state()).toBe('failed');
    expect(m.q('give-treat')?.textContent).toBe('Try again');
    expect(m.q('treat-line')?.textContent).toBe('The treat did not go through. Try again.');
    (m.q('give-treat') as HTMLButtonElement).click();
    await flush();
    expect(m.state()).toBe('sent');
    expect(sender.calls).toHaveLength(2);
    expect(m.q('treat-receipt')).toBeNull();
  });

  it('a retry after a timed-out send that answers already shows the treat as sent', async () => {
    const results: TreatOutcome[] = [];
    const sender = fakeSender('none', [{ kind: 'failed', timedOut: true }, { kind: 'already' }]);
    const controller = createTreatController({ sender, rail: () => RAIL, onResult: (o) => results.push(o) });
    const panel = createTreatPanel({ controller, rail: () => RAIL, web: true });
    document.body.append(panel.el);
    await flush();
    const btn = panel.el.querySelector<HTMLButtonElement>('[data-testid="give-treat"]')!;
    btn.click();
    await flush();
    expect(panel.el.dataset.state).toBe('failed');
    btn.click();
    await flush();
    expect(panel.el.dataset.state).toBe('sent');
    expect(panel.el.querySelector('[data-testid="treat-receipt"]')).toBeNull();
    expect(results.map((o) => o.kind)).toEqual(['failed', 'sent']);
  });

  it('a retry after a plain failure that answers already stays already', async () => {
    const m = mount(fakeSender('none', [{ kind: 'failed' }, { kind: 'already' }]));
    await flush();
    (m.q('give-treat') as HTMLButtonElement).click();
    await flush();
    (m.q('give-treat') as HTMLButtonElement).click();
    await flush();
    expect(m.state()).toBe('already');
  });

  it('without a sender: unavailable with a copy link, never a same-tab anchor', async () => {
    const copy = vi.fn(async () => {});
    const controller = createTreatController({ sender: null, rail: () => RAIL });
    const panel = createTreatPanel({ controller, rail: () => RAIL, web: true, copy });
    document.body.append(panel.el);
    expect(panel.el.dataset.state).toBe('unavailable');
    expect(panel.el.querySelector('a')).toBeNull();
    const btn = panel.el.querySelector<HTMLButtonElement>('[data-testid="treat-copy"]')!;
    btn.click();
    await flush();
    expect(copy).toHaveBeenCalledWith('https://tokentails.com/heist');
    expect(btn.textContent).toBe('Link copied');
  });

  it('two panels share one send state (results and modal)', async () => {
    const sender = fakeSender('none', [{ kind: 'sent' }]);
    const controller = createTreatController({ sender, rail: () => RAIL });
    const a = createTreatPanel({ controller, rail: () => RAIL, web: true });
    const b = createTreatPanel({ controller, rail: () => RAIL, web: true, custody: false });
    await flush();
    a.el.querySelector<HTMLButtonElement>('[data-testid="give-treat"]')!.click();
    await flush();
    expect(a.el.dataset.state).toBe('sent');
    expect(b.el.dataset.state).toBe('sent');
    expect(b.el.querySelector('[data-testid="treat-custody"]')).toBeNull();
    expect(controller.settled).toBe(true);
    b.dispose();
  });

  it('every state has its line', () => {
    for (const s of TREAT_PANEL_STATES) {
      const line = treatLine(s, RAIL, true);
      if (s === 'ready') expect(line).toBe('');
      else expect(line.length).toBeGreaterThan(5);
      expect(line.replace(/tokentails\.com|Token Tails/g, '')).not.toMatch(/adopt|token/i);
    }
  });
});
