/**
 * The in-game rescue treat: one tap sends it in place, the game never navigates (founder request,
 * 2026-10-15). Replaces the old `<a target=_blank>` to the give page, which in home-screen apps,
 * in-app browsers and WebViews replaced the game view and lost the results and any live run.
 *
 * One controller (`createTreatController`) holds the send state; the results screen and the
 * payouts modal each draw a panel (`createTreatPanel`) from it, so a treat sent in one shows as
 * sent in the other.
 *
 * | state       | line                                                        | control          |
 * |-------------|-------------------------------------------------------------|------------------|
 * | checking    | Checking today's shelter treats…                            | disabled button  |
 * | ready       |                                                             | send button      |
 * | sending     | Sending your treat…                                         | disabled, busy   |
 * | sent        | Treat sent! Token Tails sent Pink Paw a free {treat}.       | See receipt (web)|
 * | already     | Today's treat already went out. Back at 00:00 UTC.          | none             |
 * | used-up     | Today's treats are gone, back at 00:00 UTC.                 | none             |
 * | paused      | Treats are paused right now.                                | none             |
 * | not-eligible| This account can't send treats yet. Verifying your email…   | none             |
 * | failed      | The treat did not go through. Try again.                    | retry button     |
 * | unavailable | Play on tokentails.com/heist to send a treat.               | Copy link        |
 *
 * The rail's own "Opens soon" / "Checking…" chip stays with the callers (rail.ts); a panel is shown
 * while the rail is live, or once a send has an answer. Every panel carries the custody line.
 */
import { h, setText } from './dom';
import { formatTreat, type RailInfo } from './rail';
import type { TreatOutcome, TreatSender, TreatToday } from '../embed/treat-bridge';
import { safeReceipt } from '../embed/treat-bridge';

export type TreatPanelState = 'checking' | 'ready' | 'sending' | 'sent' | 'already' | 'used-up' | 'paused' | 'not-eligible' | 'failed' | 'unavailable';

export const TREAT_PANEL_STATES: readonly TreatPanelState[] = ['checking', 'ready', 'sending', 'sent', 'already', 'used-up', 'paused', 'not-eligible', 'failed', 'unavailable'];

export const TREAT_CUSTODY = 'Held by Token Tails for the shelter until handover.';
export const TREAT_BUTTON = 'Send Pink Paw a rescue treat 🐾';
export const TREAT_PLAY_URL = 'https://tokentails.com/heist';

export interface TreatSnapshot {
  state: TreatPanelState;
  receipt?: string;
}

export interface TreatController {
  readonly snapshot: TreatSnapshot;
  /** A send has an answer (sent, already, …): the panel shows even if the rail is no longer live. */
  readonly settled: boolean;
  subscribe(fn: (s: TreatSnapshot) => void): () => void;
  /** The rail went live: read today's treat once (no-op afterwards). */
  check(): void;
  send(cat?: string): Promise<void>;
  dispose(): void;
}

export interface TreatControllerOptions {
  sender: TreatSender | null;
  rail: () => RailInfo;
  /** Analytics hook for a finished send. */
  onResult?(outcome: TreatOutcome): void;
}

export function createTreatController(opts: TreatControllerOptions): TreatController {
  const sender = opts.sender && opts.sender.mode !== 'none' ? opts.sender : null;
  let snap: TreatSnapshot = { state: sender ? 'checking' : 'unavailable' };
  let checked = false;
  let settled = false;
  let busy = false;
  // The last send got no answer in time: the backend may still have sent it, so a retry that is
  // told "already went out" is this player's own treat (shown as sent, without a receipt).
  let lastTimedOut = false;
  const subs = new Set<(s: TreatSnapshot) => void>();
  const set = (next: TreatSnapshot) => {
    snap = next;
    subs.forEach((fn) => fn(snap));
  };
  const check = () => {
    if (checked || !sender || settled) return;
    checked = true;
    void sender.today().then(
      (t: TreatToday) => {
        if (settled || busy) return;
        if (t === 'sent') {
          settled = true;
          set({ state: 'already' });
        } else set({ state: 'ready' });
      },
      () => {
        if (!settled && !busy) set({ state: 'ready' });
      },
    );
  };
  return {
    get snapshot() {
      return snap;
    },
    get settled() {
      return settled;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    check,
    async send(cat) {
      if (!sender || busy) return;
      if (snap.state !== 'ready' && snap.state !== 'failed' && snap.state !== 'checking') return;
      busy = true;
      set({ state: 'sending' });
      let outcome: TreatOutcome;
      try {
        const rail = opts.rail();
        outcome = await sender.send({ ...(rail.chainId !== undefined ? { chainId: rail.chainId } : {}), ...(cat ? { cat } : {}) });
      } catch {
        outcome = { kind: 'failed' };
      }
      busy = false;
      if (outcome.kind === 'already' && lastTimedOut) outcome = { kind: 'sent' };
      lastTimedOut = outcome.kind === 'failed' && (outcome.timedOut === true || lastTimedOut);
      if (outcome.kind !== 'failed') settled = true;
      try {
        opts.onResult?.(outcome);
      } catch {
        // Analytics never breaks the treat.
      }
      set(outcome.kind === 'sent' ? { state: 'sent', ...(outcome.receipt ? { receipt: outcome.receipt } : {}) } : { state: outcome.kind });
    },
    dispose() {
      subs.clear();
    },
  };
}

/** The line under the button for a state; '' when the button says it all. */
export function treatLine(state: TreatPanelState, rail: RailInfo, web: boolean): string {
  switch (state) {
    case 'checking':
      return "Checking today's shelter treats…";
    case 'ready':
      return '';
    case 'sending':
      return 'Sending your treat…';
    case 'sent':
      // claim: C-004 (the treat amount); Token Tails pays, the player pays nothing
      return `Treat sent! Token Tails sent Pink Paw a free ${formatTreat(rail.amountUsdc, web, rail.coin)} treat.`;
    case 'already':
      return "Today's treat already went out. Back at 00:00 UTC.";
    case 'used-up':
      return "Today's treats are gone, back at 00:00 UTC.";
    case 'paused':
      return 'Treats are paused right now.';
    case 'not-eligible':
      return "This account can't send treats yet. Verifying your email usually fixes it.";
    case 'failed':
      return 'The treat did not go through. Try again.';
    case 'unavailable':
      return 'Play on tokentails.com/heist to send a treat.';
  }
}

export interface TreatPanelOptions {
  controller: TreatController;
  rail: () => RailInfo;
  /** A web page (not the Capacitor app): only the web shows the receipt link. */
  web: boolean;
  /** The rescued cat, passed with the send for the host's analytics. */
  catName?: () => string;
  /** Show the custody line (the payouts modal already says it right above). Default true. */
  custody?: boolean;
  onClick?(): void;
  /** Copies text; default navigator.clipboard. */
  copy?: (text: string) => Promise<void>;
}

export interface TreatPanel {
  readonly el: HTMLElement;
  dispose(): void;
}

const defaultCopy = async (text: string) => {
  const clip = (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard;
  if (!clip) throw new Error('no clipboard');
  await clip.writeText(text);
};

export function createTreatPanel(opts: TreatPanelOptions): TreatPanel {
  const { controller, web } = opts;
  const button = h('button.ch-give', { type: 'button', 'data-testid': 'give-treat' }, TREAT_BUTTON) as HTMLButtonElement;
  const line = h('span.ch-treat-line', { role: 'status', 'aria-live': 'polite', 'data-testid': 'treat-line' });
  const extra = h('span.ch-treat-extra');
  const custody = opts.custody === false ? null : h('span.ch-treat-custody', { 'data-testid': 'treat-custody' }, TREAT_CUSTODY);
  const el = h('div.ch-treat', { 'data-testid': 'treat-panel' }, button, line, extra, custody);
  button.addEventListener('click', () => {
    opts.onClick?.();
    void controller.send(opts.catName?.() || undefined);
  });

  const paint = (s: TreatSnapshot) => {
    el.dataset.state = s.state;
    const showButton = s.state === 'checking' || s.state === 'ready' || s.state === 'sending' || s.state === 'failed';
    button.hidden = !showButton;
    button.disabled = s.state === 'checking' || s.state === 'sending';
    if (s.state === 'sending') button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
    button.textContent = s.state === 'failed' ? 'Try again' : s.state === 'sending' ? 'Sending…' : TREAT_BUTTON;
    setText(line, treatLine(s.state, opts.rail(), web));
    line.hidden = !line.textContent;
    extra.replaceChildren();
    const receipt = safeReceipt(s.receipt);
    if (s.state === 'sent' && web && receipt) {
      extra.append(h('a.ch-treat-receipt', { href: receipt, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'treat-receipt' }, 'See receipt ›'));
    }
    if (s.state === 'unavailable') {
      const copyBtn = h('button.ch-treat-copy', { type: 'button', 'data-testid': 'treat-copy' }, 'Copy link') as HTMLButtonElement;
      copyBtn.addEventListener('click', () => {
        opts.onClick?.();
        void (opts.copy ?? defaultCopy)(TREAT_PLAY_URL).then(
          () => setText(copyBtn, 'Link copied'),
          () => setText(copyBtn, TREAT_PLAY_URL),
        );
      });
      extra.append(copyBtn);
    }
    extra.hidden = !extra.childElementCount;
  };
  paint(controller.snapshot);
  const off = controller.subscribe(paint);
  controller.check();
  return {
    el,
    dispose() {
      off();
    },
  };
}
