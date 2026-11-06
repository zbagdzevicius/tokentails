/* Shared fakes for the party HUD tests (lane M): a PartyLink and an MpHudHost recording what the HUD did. */
import { Notify } from '../../src/ui/notify';
import type { MpHudHost } from '../../src/app/mpHud';
import type { PartyLink, PartyLinkListener, SeatInfo } from '../../src/app/mpTypes';
import type { SocialKind, VoteKind } from '../../src/net/proto';

export class FakeLink implements PartyLink {
  mask = 0;
  readonly sent: { kind: SocialKind; id: number }[] = [];
  readonly votes: { kind: VoteKind; yes: boolean }[] = [];
  readonly ls = new Set<PartyLinkListener>();
  seats: SeatInfo[] = [];
  nameOf = (s: number) => `slot${s}`;
  pct = [0, 0, 0, 0, 0, 0];
  allow = true;
  constructor(
    readonly mySlot: number,
    readonly names: (string | null)[],
    readonly humans: number[] = names.slice(0, 3).map((n, i) => (n !== null ? i : -1)).filter((i) => i >= 0),
  ) {}
  piloted(slot: number) {
    return ((this.mask >>> slot) & 1) === 1;
  }
  pilotPct(slot: number) {
    return this.pct[slot];
  }
  listen(l: PartyLinkListener) {
    this.ls.add(l);
    return () => void this.ls.delete(l);
  }
  emit<K extends keyof PartyLinkListener>(k: K, ...a: Parameters<NonNullable<PartyLinkListener[K]>>) {
    for (const l of this.ls) (l[k] as ((...x: unknown[]) => void) | undefined)?.(...a);
  }
  social(kind: SocialKind, id: number) {
    if (!this.allow) return false;
    this.sent.push({ kind, id });
    return true;
  }
  vote(kind: VoteKind, yes: boolean) {
    this.votes.push({ kind, yes });
  }
  net() {
    return { rttMs: 40, buffer: 1, holds: 0, catchups: 0 };
  }
}

export function fakeHost(base: string[], opts: Partial<MpHudHost> = {}) {
  const ui = document.createElement('div');
  document.body.appendChild(ui);
  const rail = new Notify(ui);
  const tracked: { event: string; props: Record<string, string | number | boolean> }[] = [];
  const strip = new Map<number, unknown>();
  const sb = { seats: null as unknown, onMute: null as ((s: number) => void) | null, names: [] as string[], setNames(n: readonly string[]) { this.names = [...n]; } };
  const rec = { names: [] as string[], pings: [] as string[], pops: [] as string[], emotes: [] as string[] };
  let tick = 0;
  const host: MpHudHost = {
    ui,
    rail,
    overhead: { seats: null } as never,
    minimap: { ringOf: () => null } as never,
    scoreboard: () => sb as never,
    hud: () => ({ setStripSeat: (slot: number, seat: unknown) => strip.set(slot, seat) }) as never,
    baseNames: base,
    setNames: (n) => {
      rec.names = n;
      sb.setNames(n);
    },
    pingAt: (x, y) => rec.pings.push(`${x},${y}`),
    popOver: (slot, text) => rec.pops.push(`${slot}:${text}`),
    emote: (slot, pose) => rec.emotes.push(`${slot}:${pose}`),
    enabled: () => true,
    touch: true,
    newbie: false,
    difficulty: 'easy',
    track: (event, props) => tracked.push({ event, props }),
    tick: () => tick,
    ...opts,
  };
  return { host, rail, tracked, strip, sb, rec, setTick: (t: number) => (tick = t), saidAll: () => rail.said.join(' | ') };
}
