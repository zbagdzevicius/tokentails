import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/*
 * One writer (CLAUDE.md, SOCIAL-RANKED.md §6.1): board rows, ranked points and ratings are written only by `/live`
 * (pawlegends-party-live.ts). Sanctions are written only by the moderator resolve route (report.service.ts). Nothing in
 * social/ or ranked/ touches the game or user repositories or calls the score route.
 */

const SRC = join(__dirname, '..', '..');

function files(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'vendor' || name === 'node_modules' ? [] : files(path);
        return name.endsWith('.ts') && !name.endsWith('spec.ts') ? [path] : [];
    });
}

const code = (path: string) =>
    readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const ALL = files(SRC).map(path => ({ file: relative(SRC, path).split('\\').join('/'), text: code(path) }));
const WRITE =
    '(create|insertMany|insert|save|updateOne|updateMany|update|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite)';

describe('social and ranked: one writer', () => {
    it('only /live writes a board row', () => {
        const re = new RegExp(`\\b(boards|boardModel|PawlegendsBoard)(\\.model)?\\.${WRITE}\\(`, 'g');
        const sites = ALL.flatMap(({ file, text }) =>
            Array.from(text.matchAll(re)).map(m => `${file}: ${m[1]}.${m[3]}`)
        );
        expect(sites).toEqual(['pawlegends/pawlegends-party-live.ts: boards.updateOne']);
    });

    it('only the moderator resolve writes a sanction', () => {
        const re = new RegExp(`\\b(sanctions|sanctionModel)(\\.model)?\\.${WRITE}\\(`, 'g');
        const sites = ALL.flatMap(({ file, text }) =>
            Array.from(text.matchAll(re)).map(m => `${file}: ${m[1]}.${m[3]}`)
        );
        expect(sites.sort()).toEqual(
            [
                'pawlegends/social/report.service.ts: sanctions.create',
                'pawlegends/social/report.service.ts: sanctions.findOneAndUpdate',
            ].sort()
        );
    });

    it('social/ and ranked/ never touch scores', () => {
        for (const { file, text } of ALL.filter(f => /^pawlegends\/(social|ranked)\//.test(f.file))) {
            expect([
                file,
                /UserRepository|GameRepository|catbassadors\/live|ratings\.(create|updateOne)/.test(text),
            ]).toEqual([file, false]);
        }
    });
});
