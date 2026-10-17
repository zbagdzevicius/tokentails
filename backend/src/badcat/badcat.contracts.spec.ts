import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
    BADCAT_DAY1,
    BADCAT_ROUTES,
    BADCAT_SKUS,
    CAMEO_KINDS,
    CAMEO_LOADS_GUARANTEE,
    CAMEO_SHUFFLES,
    CAMEO_WEIGHTS,
    CHECKOUT_TRIGGERS,
    FOUNDING_CAP,
    FRIDGE_MAGNETS,
} from './badcat.contracts';

/*
 * The game package is the source of truth for the money block (bad-cat/src/types.ts); this spec reads it
 * as text and fails when the backend mirror drifts. No import from the game (another toolchain).
 */

const REPO = join(__dirname, '..', '..', '..');
const TYPES = join(REPO, 'bad-cat', 'src', 'types.ts');
const DAILY = join(REPO, 'bad-cat', 'src', 'content', 'daily.ts');

const text = readFileSync(TYPES, 'utf8');

/** The text of `export const NAME ... = {` up to its closing `};` (or `} as const;`). */
function block(name: string): string {
    const start = text.indexOf(`export const ${name}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = text.indexOf('\n}', start);
    return text.slice(start, end + 2);
}

const constant = (name: string) => {
    const match = new RegExp(`export const ${name}\\s*=\\s*(-?\\d+)`).exec(text);
    expect(match).not.toBeNull();
    return Number(match![1]);
};

const union = (name: string) => {
    const match = new RegExp(`export type ${name}\\s*=([^;]+);`).exec(text);
    expect(match).not.toBeNull();
    return [...match![1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);
};

describe('badcat contracts mirror bad-cat/src/types.ts', () => {
    it('has the same SKUs with the same cents, recurrence and revenue flag', () => {
        const entries = [...block('BADCAT_SKUS').matchAll(/(\w+):\s*\{([^}]*)\}/g)].map(([, key, body]) => {
            const cents = Number(/cents:\s*(\d+)/.exec(body)?.[1]);
            const recurring = /recurring:\s*'(\w+)'/.exec(body)?.[1];
            const revenueBearing = /revenueBearing:\s*(true|false)/.exec(body)?.[1] === 'true';
            const needsDay = /needsDay:\s*true/.test(body);
            const needsCat = /needsCat:\s*true/.test(body);
            return { key, cents, recurring, revenueBearing, needsDay, needsCat };
        });
        expect(entries.map(e => e.key).sort()).toEqual(Object.keys(BADCAT_SKUS).sort());
        for (const entry of entries) {
            const mine = BADCAT_SKUS[entry.key as keyof typeof BADCAT_SKUS];
            expect({
                sku: entry.key,
                cents: mine.cents,
                recurring: mine.recurring,
                revenueBearing: mine.revenueBearing,
            }).toEqual({
                sku: entry.key,
                cents: entry.cents,
                recurring: entry.recurring,
                revenueBearing: entry.revenueBearing,
            });
            expect({ sku: entry.key, needsDay: !!mine.needsDay, needsCat: !!mine.needsCat }).toEqual({
                sku: entry.key,
                needsDay: entry.needsDay,
                needsCat: entry.needsCat,
            });
        }
        expect(union('BadcatSku').sort()).toEqual(Object.keys(BADCAT_SKUS).sort());
    });

    it('has the same route paths', () => {
        const routes = Object.fromEntries(
            [...block('BADCAT_ROUTES').matchAll(/(\w+):\s*'(\/badcat[^']*)'/g)].map(([, key, path]) => [key, path])
        );
        expect(routes).toEqual(BADCAT_ROUTES);
    });

    it('has the same cameo constants, weights and kinds', () => {
        expect(constant('CAMEO_SHUFFLES')).toBe(CAMEO_SHUFFLES);
        expect(constant('FRIDGE_MAGNETS')).toBe(FRIDGE_MAGNETS);
        expect(constant('CAMEO_LOADS_GUARANTEE')).toBe(CAMEO_LOADS_GUARANTEE);
        expect(constant('FOUNDING_CAP')).toBe(FOUNDING_CAP);
        const weights = Object.fromEntries(
            [...block('CAMEO_WEIGHTS').matchAll(/(\w+):\s*(\d+)/g)].map(([, key, w]) => [key, Number(w)])
        );
        expect(weights).toEqual(CAMEO_WEIGHTS);
        expect(union('CameoKind')).toEqual([...CAMEO_KINDS]);
    });

    it('accepts every checkout trigger the game can send', () => {
        const triggers = [...union('PaywallTrigger')];
        const meta = /trigger:\s*PaywallTrigger([^;]+);/.exec(text);
        expect(meta).not.toBeNull();
        triggers.push(...[...meta![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
        expect([...CHECKOUT_TRIGGERS].sort()).toEqual(triggers.sort());
    });

    it('uses the game day 1', () => {
        if (!existsSync(DAILY)) return;
        const match = /export const DAY1 = '([\d-]+)'/.exec(readFileSync(DAILY, 'utf8'));
        if (match) expect(match[1]).toBe(BADCAT_DAY1);
        expect(new Date(`${BADCAT_DAY1}T00:00:00Z`).getUTCDay()).toBe(1); // a Monday
    });
});
