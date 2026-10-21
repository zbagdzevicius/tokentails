/**
 * Match HUD (POC.md §3): the ability bar (portrait, level, health with shield, Q W E R, Paw Trick, Nap with
 * cooldown sweeps and key labels), the top score and clock with the next phase, a kill feed and the respawn
 * overlay. DOM, updated from the latest snapshot; writes only when a value changes.
 *
 * GAPS A4: a portrait strip (allies left of the score bar, enemies right of it) with each hero's death timer from
 * `respawnIn`. GAPS A5: a tap on an enemy portrait locks that hero on touch (`HudHost.onPortrait`). GAPS B1: held for
 * PORTRAIT_HOLD_MS it also pings "Focus hero" (`HudHost.onPortraitHold`).
 */
import type { EntitySnap, HeroId, MatchClock, MatchScore, TrickId } from '../sim/api';
import { maxCooldown, ULT_LEVEL } from '../input/abilities';
import { keyLabel, type Action } from '../input/presets';
import { HERO_COLOR_CSS, RELATION_CSS } from '../render/palette';
import { portraitUrl } from '../render/portraits';
import type { Look } from '../render/cosmetics';
import { HERO_TEXT, TRICK_TEXT, abilityNumbers, branchNumbers, trickNumbers } from './heroText';
import { icon as iconSvg } from './icons';
import { icon } from './icons';
import { chargeRing } from './overhead';
import { XP } from '../data/xp';
import { DIFFICULTY_RULES, type Difficulty } from '../data/bots';

/** A tiny tower glyph on the "towers taken" boxes (the bare numbers next to the score read as nothing). */
const TOWER_SVG = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 15V6h2V3h2v2h2V3h2v3h2v9z" fill="currentColor"/></svg>';

const SLOT_ACTIONS: readonly Action[] = ['q', 'w', 'e', 'r', 'trick', 'nap'];

interface SlotEl {
  root: HTMLElement;
  sweep: HTMLElement;
  num: HTMLElement;
  last: string;
}

/** GAPS B1: an enemy portrait held this long (touch) pings Focus hero. */
export const PORTRAIT_HOLD_MS = 450;

export interface HudHost {
  /** A slot button was clicked or tapped (desktop users may click the bar). */
  onSlot(index: number): void;
  /** GAPS A5: an enemy portrait in the strip was tapped (touch only: the strip takes no mouse input). */
  onPortrait?(slot: number): void;
  /** GAPS B1: an enemy portrait was held PORTRAIT_HOLD_MS (touch): ping "Focus hero" on it. */
  onPortraitHold?(slot: number): void;
}

/**
 * One strip portrait's read (GAPS A4), pure: `until` is the tick the hero is back (kept while it is out of sight, so
 * an enemy who died in view keeps its timer), `secs` the whole seconds left while dead (null alive), `seen` whether
 * the snapshot shows it now.
 */
export function portraitTimer(e: Pick<EntitySnap, 'state' | 'respawnIn'> | undefined, tick: number, until: number): { until: number; secs: number | null; seen: boolean } {
  if (e) {
    if (e.state === 'dead') {
      const u = tick + Math.max(0, e.respawnIn ?? 0);
      return { until: u, secs: Math.max(1, Math.ceil((u - tick) / 30)), seen: true };
    }
    return { until: -1, secs: null, seen: true };
  }
  if (until > tick) return { until, secs: Math.max(1, Math.ceil((until - tick) / 30)), seen: false };
  return { until: -1, secs: null, seen: false };
}

interface StripEl {
  slot: number;
  el: HTMLElement;
  t: HTMLElement;
  until: number;
  state: string;
  /** Sim v10 (GAPS B6): the level-6 shape branch is shown on the portrait. */
  branch: boolean;
  hero: HeroId;
  label: string;
}

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const PHASE_NEXT: Record<MatchClock['phase'], string> = { gate: 'Gates open', play: 'Sunset', sunset: 'Sudden Death', suddenDeath: 'Final whistle', ended: '' };

/**
 * The "Sunset in 7:19" line (fun plan F1): hidden while Sunset is more than a minute away (a far-off countdown
 * read as "this match is long"); the other phases always show theirs. Pure.
 */
export function phaseLine(clock: Pick<MatchClock, 'phase' | 'nextPhaseIn'>): string {
  const next = PHASE_NEXT[clock.phase];
  if (!next || clock.nextPhaseIn <= 0) return '';
  if (clock.phase === 'play' && clock.nextPhaseIn > 60 * 30) return '';
  return `${next} in ${fmtClock(Math.ceil(clock.nextPhaseIn / 30))}`;
}

/** A kill-feed name and whose side it is on. */
export interface FeedName {
  name: string;
  rel: 'self' | 'ally' | 'enemy' | 'neutral';
}

export class Hud {
  readonly root: HTMLElement;
  private slots: SlotEl[] = [];
  /** Sim v10 (GAPS B6): the own hero took its level-6 shape branch; its slot shows the new ability. */
  private branchOn = false;
  private hpFill: HTMLElement;
  private hpShield: HTMLElement;
  private hpText: HTMLElement;
  private level: HTMLElement;
  private clock: HTMLElement;
  private phase: HTMLElement;
  private kills: [HTMLElement, HTMLElement];
  private towers: [HTMLElement, HTMLElement];
  private feed: HTMLElement;
  private respawnNum: HTMLElement;
  private recapEl: HTMLElement;
  private cache = new Map<string, string>();
  private strip: StripEl[] = [];

  constructor(
    parent: HTMLElement,
    private readonly hero: HeroId,
    private readonly trick: TrickId,
    private readonly host: HudHost,
    look: Look | null = null,
    /** The match's difficulty (the catch-up tag's numbers, sim v10 GAPS B3). */
    private readonly difficulty: Difficulty = 'easy',
  ) {
    const t = HERO_TEXT[hero];
    // the portrait shows the equipped look (a bought skin shows in the HUD too)
    const pic = portraitUrl(hero, look);
    const tt = TRICK_TEXT[trick];
    const root = document.createElement('div');
    root.className = 'pl-hud';
    const slotHtml = SLOT_ACTIONS.map((a, i) => {
      const ab = i < 4 ? t.abilities[i] : i === 4 ? tt : { name: 'Nap', text: 'Channel for 4 s to return to your fountain. Damage breaks it.', icon: 'nap' as const };
      const big = i === 3 ? ' ult' : i >= 4 ? ' small' : '';
      return `<button class="pl-slot${big}" data-i="${i}" aria-label="${ab.name}: ${ab.text}">${icon(ab.icon)}<i class="sweep"></i><b class="num"></b><kbd>${keyLabel(a)}</kbd></button>`;
    }).join('');
    // Round 1 ("hovering Q shows nothing"): a hover card with the words and the numbers from src/data.
    const tipText = (i: number): string => {
      const br = this.branchOn && t.branch?.slot === i ? t.branch : null;
      const ab = br ?? (i < 4 ? t.abilities[i] : i === 4 ? tt : null);
      const nums = br ? branchNumbers(hero) : i < 4 ? abilityNumbers(hero, i) : i === 4 ? trickNumbers(trick) : '4 s channel';
      const name = ab ? ab.name : 'Nap';
      const text = ab ? ab.text : 'Return to your fountain. Damage breaks it.';
      return `<b>${name}</b><span>${text}</span><small>${nums}</small>`;
    };
    root.innerHTML = `
      <div class="pl-top">
        <div class="pl-score">
          <span class="team t0"><b class="k0">0</b><i title="Towers taken">${TOWER_SVG}<em class="tw0">0</em></i></span>
          <span class="mid"><span class="clock">0:00</span><span class="phase"></span></span>
          <span class="team t1"><i title="Towers taken">${TOWER_SVG}<em class="tw1">0</em></i><b class="k1">0</b></span>
        </div>
      </div>
      <div class="pl-feed"></div>
      <div class="pl-respawn"><div>Back in <b>0</b></div><small class="recap">Your team is still fighting!</small></div>
      <div class="pl-bar">
        <div class="pl-portrait${pic ? ' pic' : ''}" style="--hero:${HERO_COLOR_CSS[hero]}${pic ? `;background-image:url(${pic})` : ''}"><span>${pic ? '' : t.title.replace('Sir ', '').slice(0, 2)}</span><b class="lvl">1</b><i class="xpbar"><i></i></i><em class="gap"></em>${hero === 'aviete' ? '<i class="charge" title="Shy, Then Shiny"></i><b class="charge-t"></b>' : ''}</div>
        <div class="pl-bar-main">
          <div class="pl-slots">${slotHtml}</div>
          <div class="pl-hp"><i class="fill"></i><i class="shield"></i><span class="txt"></span></div>
        </div>
      </div>`;
    parent.appendChild(root);
    this.root = root;
    const q = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
    const tip = document.createElement('div');
    tip.className = 'pl-slot-tip';
    root.appendChild(tip);
    for (const el of root.querySelectorAll<HTMLElement>('.pl-slot')) {
      this.slots.push({ root: el, sweep: el.querySelector('.sweep') as HTMLElement, num: el.querySelector('.num') as HTMLElement, last: '' });
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        tip.innerHTML = tipText(Number(el.dataset.i));
        const r = el.getBoundingClientRect();
        tip.style.left = `${r.left + r.width / 2}px`;
        tip.style.top = `${r.top}px`;
        tip.classList.add('on');
      });
      el.addEventListener('pointerleave', () => tip.classList.remove('on'));
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.pointerType !== 'touch') this.host.onSlot(Number(el.dataset.i));
      });
    }
    this.hpFill = q('.pl-hp .fill');
    this.hpShield = q('.pl-hp .shield');
    this.hpText = q('.pl-hp .txt');
    this.level = q('.pl-portrait .lvl');
    this.clock = q('.clock');
    this.phase = q('.phase');
    this.kills = [q('.k0'), q('.k1')];
    this.towers = [q('.tw0'), q('.tw1')];
    this.feed = q('.pl-feed');
    this.respawnNum = q('.pl-respawn b');
    this.recapEl = q('.pl-respawn .recap');
  }

  /**
   * GAPS A4: the portrait strip for the other five heroes (allies and enemies, by slot). `names` are the slot labels
   * (ui/heroText.ts slotNames). Enemy portraits are buttons: a tap locks that hero on touch (A5).
   */
  mountStrip(picks: readonly HeroId[], mySlot: number, myTeam: number, names: readonly string[]): void {
    for (const s of this.strip) s.el.remove();
    this.strip = [];
    this.root.querySelectorAll('.pl-strip').forEach((el) => el.remove());
    const mk = (side: 'ally' | 'enemy'): HTMLElement => {
      const box = document.createElement('div');
      box.className = `pl-strip ${side}`;
      return box;
    };
    const allies = mk('ally');
    const enemies = mk('enemy');
    picks.forEach((hero, slot) => {
      if (slot === mySlot || !hero) return;
      const enemy = (slot < 3 ? 0 : 1) !== myTeam;
      const el: HTMLElement = document.createElement(enemy ? 'button' : 'div');
      el.className = 'pp';
      if (enemy) (el as HTMLButtonElement).type = 'button';
      el.dataset.slot = String(slot);
      const pic = portraitUrl(hero);
      el.style.setProperty('--hero', HERO_COLOR_CSS[hero]);
      el.style.setProperty('--rel', RELATION_CSS[enemy ? 'enemy' : 'ally']);
      const label = names[slot] ?? HERO_TEXT[hero].title;
      el.setAttribute('aria-label', enemy ? `Lock ${label}` : label);
      el.title = label;
      // GAPS B6: a small badge (hidden until the hero takes its level-6 shape branch) so the other side can read it
      const br = HERO_TEXT[hero].branch;
      el.innerHTML = `<i class="pic${pic ? '' : ' none'}"${pic ? ` style="background-image:url(${pic})"` : ''}>${pic ? '' : HERO_TEXT[hero].title.replace('Sir ', '').slice(0, 2)}</i><b class="t"></b>${br ? `<i class="br">${iconSvg(br.icon)}</i>` : ''}`;
      if (enemy) {
        let holdTimer: ReturnType<typeof setTimeout> | null = null;
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (e.pointerType === 'touch' || document.documentElement.dataset.touch === '1') {
            this.host.onPortrait?.(slot);
            // GAPS B1: held, the tap's lock also becomes a Focus ping
            if (holdTimer) clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
              holdTimer = null;
              this.host.onPortraitHold?.(slot);
            }, PORTRAIT_HOLD_MS);
          }
        });
        const release = (): void => {
          if (holdTimer) clearTimeout(holdTimer);
          holdTimer = null;
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);
      }
      (enemy ? enemies : allies).appendChild(el);
      this.strip.push({ slot, el, t: el.querySelector('.t') as HTMLElement, until: -1, state: '', branch: false, hero, label });
    });
    this.root.appendChild(allies);
    this.root.querySelector('.pl-top')?.appendChild(enemies);
  }

  /** GAPS A4: death timers and who is out of sight; `lock` is the touch-locked enemy (A5), or null. */
  stripUpdate(byId: ReadonlyMap<number, EntitySnap>, tick: number, lock: number | null): void {
    for (const s of this.strip) {
      const r = portraitTimer(byId.get(s.slot), tick, s.until);
      s.until = r.until;
      const state = `${r.secs !== null ? 'D' : ''}${r.seen ? '' : 'U'}${lock === s.slot ? 'L' : ''}`;
      if (state !== s.state) {
        s.state = state;
        s.el.classList.toggle('dead', r.secs !== null);
        s.el.classList.toggle('unseen', !r.seen && r.secs === null);
        s.el.classList.toggle('locked', lock === s.slot);
      }
      const txt = r.secs !== null ? String(r.secs) : '';
      if (s.t.textContent !== txt) s.t.textContent = txt;
      // GAPS B6: once a hero takes its level-6 shape branch, its portrait says so (badge and name)
      const br = byId.get(s.slot)?.branch === true;
      if (br && !s.branch) {
        s.branch = true;
        const b = HERO_TEXT[s.hero].branch;
        s.el.classList.add('branch');
        if (b) s.el.title = `${s.label} · ${b.name}`;
      }
    }
  }

  /** GAPS B6: swap the branched slot's icon and label to the level-6 shape branch's ability. */
  private showBranch(): void {
    this.branchOn = true;
    const b = HERO_TEXT[this.hero].branch;
    const el = b ? this.slots[b.slot]?.root : undefined;
    if (!b || !el) return;
    el.setAttribute('aria-label', `${b.name}: ${b.text}`);
    el.classList.add('branch');
    el.querySelector('svg.pl-icon')?.remove();
    el.insertAdjacentHTML('afterbegin', iconSvg(b.icon));
  }

  /** The death recap under "Back in N" ("Knocked out by Cacklejaw + a tower: wait for your minions"). */
  recap(text: string): void {
    this.set('recap', this.recapEl, text || 'Your team is still fighting!');
  }

  private set(key: string, el: HTMLElement, text: string): void {
    if (this.cache.get(key) === text) return;
    this.cache.set(key, text);
    el.textContent = text;
  }

  /**
   * Round 2 ("once behind, the human falls 2 to 4 levels below the lobby and nothing shows it"): an XP bar on the
   * portrait, and when the enemy team's average level is 2+ above, a "−2 lv · +35% XP" tag (the sim's catch-up:
   * data/xp.ts XP.catchUpFreeLevels and, since sim v10, DifficultyRules.catchUp*). `enemyAvg` is the enemy heroes'
   * average level (0 = unknown).
   */
  private xpUpdate(me: EntitySnap, enemyAvg: number): void {
    const lv = me.level ?? 1;
    const xp = me.xp ?? 0;
    const lo = XP.toLevel[lv - 1] ?? 0;
    const hi = XP.toLevel[lv] ?? lo;
    const f = lv >= XP.maxLevel || hi <= lo ? 1 : Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
    const bar = this.level.parentElement?.querySelector<HTMLElement>('.xpbar > i');
    if (bar) bar.style.width = `${Math.round(f * 100)}%`;
    const behind = enemyAvg > 0 ? enemyAvg - lv : 0;
    const rules = DIFFICULTY_RULES[this.difficulty];
    const bonus = Math.min(rules.catchUpMaxBp, Math.max(0, Math.round((behind - XP.catchUpFreeLevels) * rules.catchUpPerLevelBp))) / 100;
    const tag = behind >= 2 ? `−${Math.floor(behind)} lv${bonus > 0 ? ` · +${Math.round(bonus)}% XP` : ''}` : '';
    const gap = this.level.parentElement?.querySelector<HTMLElement>('.gap');
    if (gap && gap.textContent !== tag) {
      gap.textContent = tag;
      gap.title = tag ? 'You are behind the enemy team: you earn bonus XP until you catch up.' : '';
    }
  }

  /**
   * Sim v9, Avietė: the portrait ring. A spark ring while Charged (her next damage to a hero stuns), a grey ring with
   * the seconds left during the lockout (Shiny Coat then gives speed only), nothing otherwise.
   */
  private chargeUpdate(me: EntitySnap): void {
    const el = this.root.querySelector<HTMLElement>('.pl-portrait .charge');
    if (!el) return;
    const c = chargeRing(me);
    if ((el.dataset.state ?? '') !== c.state) el.dataset.state = c.state;
    el.style.setProperty('--left', c.frac.toFixed(3));
    const t = this.root.querySelector<HTMLElement>('.pl-portrait .charge-t');
    if (t) this.set('charge', t, c.state === 'lockout' ? String(c.secs) : '');
  }

  update(me: EntitySnap | null, clock: MatchClock, score: MatchScore, myTeam: number, enemyAvg = 0): void {
    this.set('clock', this.clock, fmtClock(clock.seconds));
    this.set('phase', this.phase, phaseLine(clock));
    this.root.dataset.phase = clock.phase;
    // own team on the left
    const a = myTeam === 0 ? 0 : 1;
    this.set('k0', this.kills[0], String(score.kills[a]));
    this.set('k1', this.kills[1], String(score.kills[1 - a]));
    this.set('t0', this.towers[0], String(score.towers[a]));
    this.set('t1', this.towers[1], String(score.towers[1 - a]));
    if (!me) return;
    if (me.branch && !this.branchOn) this.showBranch();
    const dead = me.state === 'dead';
    this.root.classList.toggle('dead', dead);
    const back = Math.max(1, Math.ceil((me.respawnIn ?? 0) / 30));
    if (dead) this.set('respawn', this.respawnNum, String(back));
    // an open talent card hides the respawn chip (CSS) and shows the countdown as a badge on its header
    const head = this.root.parentElement?.querySelector<HTMLElement>('.pl-talents.on .head') ?? null;
    if (head) {
      const want = dead ? `Back in ${back}` : '';
      if ((head.dataset.respawn ?? '') !== want) {
        if (want) head.dataset.respawn = want;
        else delete head.dataset.respawn;
      }
    }
    const total = Math.max(me.maxHp, me.hp + me.shield) || 1;
    this.hpFill.style.width = `${(Math.max(0, me.hp) / total) * 100}%`;
    this.hpShield.style.left = `${(Math.max(0, me.hp) / total) * 100}%`;
    this.hpShield.style.width = `${(Math.max(0, me.shield) / total) * 100}%`;
    this.set('hp', this.hpText, `${Math.max(0, me.hp)} / ${me.maxHp}`);
    this.root.classList.toggle('low', me.hp < me.maxHp * 0.3);
    const lv = me.level ?? 1;
    this.set('lvl', this.level, String(lv));
    this.xpUpdate(me, enemyAvg);
    this.chargeUpdate(me);
    const cds = me.cooldowns;
    for (let i = 0; i < 5; i++) {
      const s = this.slots[i];
      const cd = cds?.[i] ?? 0;
      const locked = i === 3 && lv < ULT_LEVEL;
      const max = maxCooldown(this.hero, i as 0 | 1 | 2 | 3 | 4, this.trick, this.branchOn);
      const f = cd > 0 ? Math.min(1, cd / Math.max(1, max)) : 0;
      const state = `${locked ? 'L' : ''}${cd > 0 ? 'C' : ''}${dead ? 'D' : ''}`;
      if (s.last !== state) {
        s.last = state;
        s.root.classList.toggle('locked', locked);
        s.root.classList.toggle('cooling', cd > 0);
        s.root.classList.toggle('ready', cd === 0 && !locked && !dead);
      }
      s.sweep.style.setProperty('--cd', f.toFixed(3));
      this.set(`n${i}`, s.num, cd > 0 ? String(Math.ceil(cd / 30)) : locked ? String(ULT_LEVEL) : '');
    }
  }

  /**
   * A line in the kill feed. Both names carry their side's colour (self gold, allies teal, enemies red), and the
   * player's own hero reads "You", so two Clems on opposite sides cannot be confused.
   */
  kill(killer: FeedName, victim: FeedName, good: boolean): void {
    const el = document.createElement('div');
    el.className = `pl-feed-row ${good ? 'good' : 'bad'}`;
    el.innerHTML = `<b></b><span>${icon('sword')}</span><b></b>`;
    const bs = el.querySelectorAll('b');
    for (const [b, n] of [
      [bs[0], killer],
      [bs[1], victim],
    ] as const) {
      b.textContent = n.name;
      b.style.color = RELATION_CSS[n.rel];
      b.dataset.rel = n.rel;
    }
    this.feed.prepend(el);
    while (this.feed.children.length > 4) this.feed.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 5000);
    setTimeout(() => el.remove(), 5600);
  }

  /** A neutral line in the kill feed ("Blaze cheered your takedown"; round 1: the squad mates get a moment). */
  note(text: string): void {
    const el = document.createElement('div');
    el.className = 'pl-feed-row note';
    el.innerHTML = `<span>${icon('paw')}</span><b></b>`;
    (el.querySelector('b') as HTMLElement).textContent = text;
    this.feed.prepend(el);
    while (this.feed.children.length > 4) this.feed.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 4000);
    setTimeout(() => el.remove(), 4600);
  }

  /**
   * Level up (fun plan F2 item 6): the portrait pops, the health bar glows as it refills, and at the ultimate's level
   * the R slot pulses and sparkles for 3 s.
   */
  levelUp(level: number, ultLevel = ULT_LEVEL): void {
    const bar = this.root.querySelector<HTMLElement>('.pl-bar');
    if (bar) {
      bar.classList.remove('lvlup');
      void bar.offsetWidth;
      bar.classList.add('lvlup');
      setTimeout(() => bar.classList.remove('lvlup'), 1200);
    }
    if (level === ultLevel) {
      const r = this.slots[3]?.root;
      if (r) {
        r.classList.add('ult-ready');
        setTimeout(() => r.classList.remove('ult-ready'), 3000);
      }
      try {
        document.documentElement.dataset.ultReady = '1';
        setTimeout(() => delete document.documentElement.dataset.ultReady, 3000);
      } catch {
        /* node */
      }
    }
  }

  /** Flash a slot (cast feedback). */
  pulse(index: number): void {
    const s = this.slots[index];
    if (!s) return;
    s.root.classList.remove('pulse');
    void s.root.offsetWidth;
    s.root.classList.add('pulse');
  }

  dispose(): void {
    this.root.remove();
  }
}
