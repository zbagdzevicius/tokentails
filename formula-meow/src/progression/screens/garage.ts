/**
 * Garage (lazy screen): kart bodies with their stat bars, paint presets and the kart number, hats, trails and the
 * driver (your own cat, Tofu, or a playable Pink Paw cat), on a turntable preview. Anything can be tried on; bodies
 * and hats are bought with fish (an in-game currency only: no real money, no purchase path, no ads), trails are won
 * with podiums and shelter cats with cup trophies.
 */
import type { Shell } from '../../core/app/shell';
import type { ScreenApi, ScreenModule } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { button, h, keepFocus, modal, panel, statBars, tabs, toast, actionFooter } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { DEFAULT_CAT, type BodyId, type RacerInfo } from '../../types';
import { BODY_IDS, BODY_NAMES, HAT_IDS, TRAIL_IDS, type HatId, type TrailId } from '../../content/ids';
import { KART_BODIES } from '../../content/karts';
import { BODY_PRICES, HAT_INFO, HAT_PRICES, PAINT_PRESETS, TRAIL_INFO, TRAIL_RULES } from '../../content/cosmetics';
import { PINK_PAW_LINE, pinkPawAdoptUrl, pinkPawCatSpec } from '../../share/pinkpaw/pink-paw';
import { shelterCatNote, shelterUnlockOrder } from '../../share/pinkpaw/unlocks';
import { shareHooks } from '../../share/hooks';
import { trackById } from '../../core/track/tracks';
import { buy } from '../economy';
import { kartFromLoadout } from '../loadout';
import { trophyCount } from '../unlocks';
import { onProg, prog, setProg } from '../store';
import type { Loadout } from '../state';
import { KartPreview } from './preview';

type Tab = 'kart' | 'paint' | 'hat' | 'trail' | 'cat';
const TABS: Tab[] = ['kart', 'paint', 'hat', 'trail', 'cat'];
const TAB_NAMES: Record<Tab, string> = { kart: 'Kart', paint: 'Paint', hat: 'Hat', trail: 'Trail', cat: 'Driver' };
export const BODY_ICONS: Readonly<Record<BodyId, string>> = { 0: '🥫', 1: '📦', 2: '🐟', 3: '🧺', 4: '🤖', 5: '☕' };

/** weight 0.8..1.3 on the 1..5 bar scale */
const weightBar = (w: number) => Math.max(1, Math.min(5, 1 + ((w - 0.8) / 0.5) * 4));

export function garageScreen(shell: Shell): ScreenModule {
  void shell;
  return {
    mount(root: HTMLElement, _params: unknown, api: ScreenApi) {
      let tab: Tab = 'kart';
      /** what is being tried on (not necessarily owned) */
      const tryOn: Partial<Loadout> = {};
      const wallet = h('span', { class: 'fm-prog-wallet', 'aria-live': 'polite', 'aria-label': t('Fish coins') }, [`🐟 ${prog().fish}`]);
      const stage = h('div', { class: 'fm-garage-stage' });
      const stageLbl = h('span', { class: 'lbl' });
      const stageTag = h('span', { class: 'tag' }, [t('Try on: free')]);
      stage.append(stageLbl, stageTag);
      const grid = h('div', { class: 'fm-garage-grid' });
      const detail = h('div', { class: 'fm-garage-detail', 'aria-live': 'polite' });
      const preview = new KartPreview(stage);
      const tabRow0 = tabs(
        TABS.map((x) => t(TAB_NAMES[x])),
        (i) => {
          tab = TABS[i];
          render();
        },
      );
      const tabRow = h('div', { class: 'fm-garage-tabs' }, [tabRow0]);
      const body = panel(null, [
        h('div', { class: 'fm-prog-head fm-garage-head' }, [h('button', { class: 'fm-m-back', type: 'button', 'aria-label': t('Back'), 'data-act': 'head-back', onclick: () => screens.back() }, ['‹']), h('h1', {}, [t('Garage')]), wallet]),
        stage,
        tabRow,
        grid,
        detail,
        h('div', { class: 'fm-garage-foot' }, [actionFooter([
          button(t('Done'), () => api.close(), { primary: true, act: 'done' }),
          button(t('🏆 Awards'), () => void screens.push('achievements'), { act: 'awards' }),
          button(t('📊 Stats'), () => void screens.push('stats'), { act: 'stats' }),
        ])]),
      ], 'fm-prog-screen fm-garage');
      root.append(body);

      const look = (): Loadout => ({ ...prog().equip, ...tryOn });
      const racerFor = (l: Loadout): RacerInfo => {
        const shelter = l.cat ? shelterUnlockOrder().find((c) => c.id === l.cat) : undefined;
        const own = shareHooks().playerRacer?.() ?? null;
        return {
          name: shelter?.name ?? own?.name ?? 'Tofu',
          cat: shelter ? pinkPawCatSpec(shelter) : (own?.cat ?? DEFAULT_CAT),
          kart: kartFromLoadout(l),
          hat: l.hat,
          trail: l.trail,
        };
      };
      const updatePreview = () => {
        const l = look();
        const r = racerFor(l);
        preview.show(r, l.trail);
        stageLbl.textContent = `${r.name} · ${t(BODY_NAMES[l.body])}`;
        const trying = Object.entries(tryOn).some(([k, v]) => (prog().equip as unknown as Record<string, unknown>)[k] !== v);
        stageTag.hidden = !trying;
      };

      const equip = (p: Partial<Loadout>) => {
        const s = prog();
        setProg({ ...s, equip: { ...s.equip, ...p } });
        for (const k of Object.keys(p) as Array<keyof Loadout>) delete tryOn[k];
      };

      const purchase = async (kind: 'body' | 'hat', id: number, name: string, price: number) => {
        const i = await modal(t('Buy {name}?', { name }), t('{price} fish coins. You have {fish}.', { price, fish: prog().fish }), [t('Buy'), t('Not now')]);
        if (i !== 0) return;
        const r = buy(prog(), kind, id);
        if (!r.ok) {
          toast(r.reason === 'fish' ? t('Not enough fish yet') : t('Already yours'));
          return;
        }
        setProg(r.save);
        equip(kind === 'body' ? { body: id as BodyId } : { hat: id });
        shell.appBus.emit('purchase', { kind, id: kind === 'body' ? String(id) : HAT_IDS[id], cost: price });
        toast(t('{name} is yours!', { name }));
        wallet.classList.remove('bump');
        void wallet.offsetWidth;
        wallet.classList.add('bump');
        render();
      };

      const item = (o: { icon: string | HTMLElement; label: string; sub: string; selected: boolean; equipped: boolean; locked: boolean; fresh?: boolean; act: string; onClick: () => void }) =>
        h(
          'button',
          {
            class: `fm-gitem${o.selected ? ' sel' : ''}${o.equipped ? ' eq' : ''}${o.locked ? ' locked' : ''}${o.fresh ? ' new' : ''}`,
            type: 'button',
            'data-item': o.act,
            'aria-pressed': String(o.selected),
            'aria-label': `${o.label}, ${o.sub}`,
            onclick: o.onClick,
          },
          [typeof o.icon === 'string' ? h('span', { class: 'ic', 'aria-hidden': 'true' }, [o.icon]) : o.icon, h('span', {}, [o.label]), h('small', {}, [o.sub])],
        );

      const price = (n: number) => t('{n} 🐟', { n });

      function renderKart(): void {
        const s = prog();
        const l = look();
        grid.className = 'fm-garage-grid';
        for (const b of BODY_IDS) {
          const owned = s.owned.bodies.includes(b);
          grid.append(
            item({
              icon: BODY_ICONS[b],
              label: t(BODY_NAMES[b]),
              sub: s.equip.body === b ? t('Driving') : owned ? t('Owned') : price(BODY_PRICES[b]),
              selected: l.body === b,
              equipped: s.equip.body === b,
              locked: !owned,
              act: `body-${b}`,
              onClick: () => {
                if (owned) equip({ body: b });
                else tryOn.body = b;
                render();
              },
            }),
          );
        }
        const b = l.body;
        const st = KART_BODIES[b];
        const owned = s.owned.bodies.includes(b);
        detail.append(
          h('h3', {}, [`${BODY_ICONS[b]} ${t(BODY_NAMES[b])}`]),
          statBars([
            { label: t('Speed'), value: st.speed },
            { label: t('Accel'), value: st.accel },
            { label: t('Handling'), value: st.handling },
            { label: t('Weight'), value: weightBar(st.weight) },
          ]),
          owned
            ? h('p', {}, [s.equip.body === b ? t('Your kart. Bodies change how the kart drives.') : t('Owned. Tap it to drive it.')])
            : button(s.fish >= BODY_PRICES[b] ? t('Buy for {n} 🐟', { n: BODY_PRICES[b] }) : t('Need {n} more 🐟', { n: BODY_PRICES[b] - s.fish }), () => void purchase('body', b, t(BODY_NAMES[b]), BODY_PRICES[b]), {
                primary: true,
                disabled: s.fish < BODY_PRICES[b],
                act: 'buy',
              }),
        );
      }

      function renderPaint(): void {
        const s = prog();
        grid.className = 'fm-garage-grid';
        PAINT_PRESETS.forEach((p, i) => {
          const sw = h('span', { class: 'sw', 'aria-hidden': 'true' }, p.paint.map((c) => h('i', { style: `background:#${c.toString(16).padStart(6, '0')}` })));
          grid.append(
            item({ icon: sw, label: t(p.name), sub: s.equip.paint === i ? t('On your kart') : t('Free'), selected: s.equip.paint === i, equipped: s.equip.paint === i, locked: false, act: `paint-${i}`, onClick: () => (equip({ paint: i }), render()) }),
          );
        });
        const num = h('b', {}, [String(s.equip.number).padStart(2, '0')]);
        const step = (d: number) => {
          equip({ number: (prog().equip.number + d + 100) % 100 });
          num.textContent = String(prog().equip.number).padStart(2, '0');
          updatePreview();
        };
        detail.append(
          h('h3', {}, [t('Kart number')]),
          h('div', { class: 'fm-garage-num' }, [button('−', () => step(-1), { aria: t('Number down'), act: 'num-down' }), num, button('+', () => step(1), { aria: t('Number up'), act: 'num-up' })]),
        );
      }

      function renderHat(): void {
        const s = prog();
        const l = look();
        grid.className = 'fm-garage-grid';
        HAT_IDS.forEach((id: HatId, i) => {
          const owned = s.owned.hats.includes(i);
          grid.append(
            item({
              icon: HAT_INFO[id].icon,
              label: t(HAT_INFO[id].name),
              sub: s.equip.hat === i ? t('Wearing') : owned ? t('Owned') : price(HAT_PRICES[id]),
              selected: l.hat === i,
              equipped: s.equip.hat === i,
              locked: !owned,
              act: `hat-${id}`,
              onClick: () => {
                if (owned) equip({ hat: i });
                else tryOn.hat = i;
                render();
              },
            }),
          );
        });
        const i = l.hat;
        const id = HAT_IDS[i];
        const owned = s.owned.hats.includes(i);
        detail.append(
          h('h3', {}, [`${HAT_INFO[id].icon} ${t(HAT_INFO[id].name)}`]),
          owned
            ? h('p', {}, [s.equip.hat === i ? (i ? t('On your cat. Looking sharp.') : t('No hat today.')) : t('Owned. Tap it to wear it.')])
            : button(s.fish >= HAT_PRICES[id] ? t('Buy for {n} 🐟', { n: HAT_PRICES[id] }) : t('Need {n} more 🐟', { n: HAT_PRICES[id] - s.fish }), () => void purchase('hat', i, t(HAT_INFO[id].name), HAT_PRICES[id]), {
                primary: true,
                disabled: s.fish < HAT_PRICES[id],
                act: 'buy',
              }),
        );
      }

      function renderTrail(): void {
        const s = prog();
        const l = look();
        grid.className = 'fm-garage-grid';
        TRAIL_IDS.forEach((id: TrailId, i) => {
          const owned = s.owned.trails.includes(i);
          grid.append(
            item({
              icon: TRAIL_INFO[id].icon,
              label: t(TRAIL_INFO[id].name),
              sub: s.equip.trail === i ? t('On your kart') : owned ? t('Owned') : t('🔒 Podium'),
              selected: l.trail === i,
              equipped: s.equip.trail === i,
              locked: !owned,
              fresh: s.fresh.includes(`trail:${id}`),
              act: `trail-${id}`,
              onClick: () => {
                if (owned) equip({ trail: i });
                else tryOn.trail = i;
                render();
              },
            }),
          );
        });
        const id = TRAIL_IDS[l.trail];
        const owned = s.owned.trails.includes(l.trail);
        const where = TRAIL_RULES[id] ? trackById(TRAIL_RULES[id]).name : '';
        detail.append(
          h('h3', {}, [`${TRAIL_INFO[id].icon} ${t(TRAIL_INFO[id].name)}`]),
          h('p', {}, [l.trail === 0 ? t('No trail behind your kart.') : owned ? (s.equip.trail === l.trail ? t('Behind your kart.') : t('Owned. Tap it to use it.')) : t('Finish on the podium at {track} to win it.', { track: where })]),
        );
      }

      function renderCat(): void {
        const s = prog();
        const l = look();
        grid.className = 'fm-garage-grid wide';
        const own = shareHooks().playerRacer?.() ?? null;
        grid.append(
          item({ icon: '🐱', label: own?.name ?? 'Tofu', sub: s.equip.cat == null ? t('Driving') : t('Your cat'), selected: l.cat == null, equipped: s.equip.cat == null, locked: false, act: 'cat-own', onClick: () => (equip({ cat: null }), render()) }),
        );
        const trophies = trophyCount(s);
        shelterUnlockOrder().forEach((c, i) => {
          const owned = s.owned.cats.includes(c.id);
          grid.append(
            item({
              icon: '🐈',
              label: c.name,
              sub: s.equip.cat === c.id ? t('Driving') : owned ? t('Pink Paw cat') : t('🔒 Trophy {n}', { n: i + 1 }),
              selected: l.cat === c.id,
              equipped: s.equip.cat === c.id,
              locked: !owned,
              fresh: s.fresh.includes(`cat:${c.id}`),
              act: `cat-${i}`,
              onClick: () => {
                if (owned) equip({ cat: c.id });
                else tryOn.cat = c.id;
                render();
              },
            }),
          );
        });
        const cat = l.cat ? shelterUnlockOrder().find((c) => c.id === l.cat) : undefined;
        if (!cat) {
          detail.append(h('h3', {}, [own?.name ?? 'Tofu']), h('p', {}, [own ? t('Your own cat from the cat maker.') : t('Tofu, the grey tabby. Make your own cat from a photo in Your cat.')]));
          return;
        }
        const idx = shelterUnlockOrder().indexOf(cat);
        const note = shelterCatNote(cat);
        const owned = s.owned.cats.includes(cat.id);
        detail.append(
          h('h3', {}, [cat.name]),
          h('p', {}, [`${t(PINK_PAW_LINE)} · ${t(note.status)} (${t('as of {d}', { d: note.asOf })})`]),
          h('p', { class: 'fm-gnote' }, [t(cat.bio)]),
          owned ? h('p', {}, [t('Unlocked with a cup trophy. Race as {name}.', { name: cat.name })]) : h('p', {}, [t('Win cup trophy number {n} to race as {name} (you have {have}).', { n: idx + 1, name: cat.name, have: trophies })]),
          h('a', { class: 'fm-line', href: pinkPawAdoptUrl(cat), target: '_blank', rel: 'noopener' }, [t('Meet {name}', { name: cat.name })]),
        );
      }

      function render(): void {
        keepFocus(root, build);
      }
      function build(): void {
        grid.textContent = '';
        detail.textContent = '';
        wallet.textContent = `🐟 ${prog().fish}`;
        if (tab === 'kart') renderKart();
        else if (tab === 'paint') renderPaint();
        else if (tab === 'hat') renderHat();
        else if (tab === 'trail') renderTrail();
        else renderCat();
        // seen: the NEW badges of this tab go away next time
        const s = prog();
        const prefix = tab === 'trail' ? 'trail:' : tab === 'cat' ? 'cat:' : null;
        if (prefix && s.fresh.some((f) => f.startsWith(prefix))) setTimeout(() => setProg({ ...prog(), fresh: prog().fresh.filter((f) => !f.startsWith(prefix)) }), 1200);
        updatePreview();
      }
      const off = onProg((s) => (wallet.textContent = `🐟 ${s.fish}`));
      render();
      return {
        unmount() {
          off();
          preview.dispose();
        },
      };
    },
  };
}
