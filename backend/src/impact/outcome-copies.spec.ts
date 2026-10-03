import { readFileSync } from 'fs';
import { join } from 'path';
import { OUTCOME_TYPES } from './outcome.schema';

/*
 * Outcome types are duplicated (CLAUDE.md): the backend schema, the CMS model and the client labels on
 * /impact. This spec reads the two copies as text and fails when they drift.
 */

const ROOT = join(__dirname, '..', '..', '..');

function stringsIn(block: string): string[] {
    return [...block.matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
}

describe('outcome type copies', () => {
    it('cms/models/outcome.ts lists the same types in the same order', () => {
        const text = readFileSync(join(ROOT, 'cms/models/outcome.ts'), 'utf8');
        const block = /export const OUTCOME_TYPES = \[([\s\S]*?)\] as const/.exec(text);
        expect(block).not.toBeNull();
        expect(stringsIn(block![1])).toEqual([...OUTCOME_TYPES]);
    });

    it('client/pages/impact.tsx has a label for every type and no extra ones', () => {
        const text = readFileSync(join(ROOT, 'client/pages/impact.tsx'), 'utf8');
        const block = /const OUTCOME_LABEL: Record<string, string> = \{([\s\S]*?)\};/.exec(text);
        expect(block).not.toBeNull();
        const keys = [...block![1].matchAll(/^\s*([a-z-]+):/gm)].map(m => m[1]);
        expect([...keys].sort()).toEqual([...OUTCOME_TYPES].sort());
    });
});
