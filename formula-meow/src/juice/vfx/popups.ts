/**
 * Style popups (GDD 11 UI, sticker style): short tilted callouts for the moments the HUD banner does not cover —
 * overtake chains, landing a hit, blocking one, slipstream, big air. They stack under the banner, pop in with a
 * squash, float up and fade. DOM only (zero draw calls), at most 3 on screen, never block input.
 */
const CSS = `
.fmj-pops{position:fixed;left:0;right:0;top:calc(30% + env(safe-area-inset-top));height:0;z-index:11;pointer-events:none;
  font-family:ui-rounded,'SF Pro Rounded',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-weight:800;}
.fmj-pop{position:absolute;left:50%;top:0;white-space:nowrap;font-size:clamp(22px,7vw,40px);letter-spacing:.5px;color:#fff3dc;
  text-shadow:-3px -3px 0 #2a1a22,3px -3px 0 #2a1a22,-3px 3px 0 #2a1a22,3px 3px 0 #2a1a22,0 5px 0 #2a1a22;
  animation:fmj-pop .95s cubic-bezier(.2,1.6,.4,1) forwards;}
.fmj-pop small{font-size:.55em;display:block;text-align:center;opacity:.9}
.fmj-pop.pink{color:#ff7cc4}.fmj-pop.cyan{color:#7ff9f6}.fmj-pop.gold{color:#ffd27a}.fmj-pop.green{color:#9dff8a}.fmj-pop.red{color:#ff8a8a}
@keyframes fmj-pop{0%{transform:translate(-50%,0) rotate(var(--r)) scale(.2);opacity:0}
  18%{transform:translate(-50%,0) rotate(var(--r)) scale(1.18);opacity:1}
  32%{transform:translate(-50%,0) rotate(var(--r)) scale(1)}
  75%{opacity:1}
  100%{transform:translate(-50%,-70px) rotate(var(--r)) scale(.92);opacity:0}}
@media (prefers-reduced-motion: reduce){.fmj-pop{animation-duration:.01s;animation-name:none}}
`;

export type PopTone = '' | 'pink' | 'cyan' | 'gold' | 'green' | 'red';

export class Popups {
  private readonly root: HTMLDivElement;
  private readonly live: HTMLDivElement[] = [];
  private slot = 0;

  constructor(host: HTMLElement) {
    if (!document.getElementById('fmj-css')) {
      const st = document.createElement('style');
      st.id = 'fmj-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'fmj-pops';
    host.appendChild(this.root);
  }

  show(text: string, tone: PopTone = '', sub?: string): void {
    const el = document.createElement('div');
    el.className = `fmj-pop ${tone}`;
    el.textContent = text;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      el.appendChild(s);
    }
    this.slot = (this.slot + 1) % 3;
    el.style.setProperty('--r', `${(this.slot - 1) * 6 + (Math.random() - 0.5) * 4}deg`);
    el.style.top = `${this.slot * 44}px`;
    this.root.appendChild(el);
    this.live.push(el);
    while (this.live.length > 3) this.live.shift()?.remove();
    setTimeout(() => {
      el.remove();
      const i = this.live.indexOf(el);
      if (i >= 0) this.live.splice(i, 1);
    }, 1000);
  }

  clear(): void {
    for (const el of this.live) el.remove();
    this.live.length = 0;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }
}

/** Pure: overtake chain → callout. Chains reset after 3 s without a pass. */
export function overtakeCallout(chain: number, place: number): { text: string; tone: PopTone; sub?: string } {
  if (place === 1) return { text: 'P1!', tone: 'gold', sub: chain > 1 ? `${chain} in a row` : 'take the lead' };
  if (chain >= 4) return { text: 'MEOWTASTIC!', tone: 'pink', sub: `${chain} in a row` };
  if (chain === 3) return { text: 'TRIPLE!', tone: 'pink' };
  if (chain === 2) return { text: 'DOUBLE!', tone: 'cyan' };
  return { text: `P${place}`, tone: 'cyan' };
}
