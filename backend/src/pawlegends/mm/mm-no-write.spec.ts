import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/*
 * One writer (CLAUDE.md, M1A-IMPL.md §0, §6.1): the hidden Quick Play rating is written only by `/live`
 * (pawlegends-party-live.ts) and re-keyed only by the guest merge (mm/rating-merge.ts). Nothing under mm/ touches the
 * user or game repositories, and the relay glue never calls the score route.
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

const RATING_WRITE =
    /\b(ratings|ratingModel|PawlegendsRating)(\.model)?\.(create|insertMany|insert|save|updateOne|updateMany|update|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite|deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete)\(/g;

describe('mm: one rating writer', () => {
    it('only /live writes the rating; only the guest merge re-keys it', () => {
        const sites = ALL.flatMap(({ file, text }) =>
            Array.from(text.matchAll(RATING_WRITE)).map(m => `${file}: ${m[1]}.${m[3]}`)
        ).sort();
        expect(sites).toEqual(
            [
                'pawlegends/pawlegends-party-live.ts: ratings.create',
                'pawlegends/pawlegends-party-live.ts: ratings.updateOne',
                'pawlegends/mm/rating-merge.ts: ratings.replaceOne',
                'pawlegends/mm/rating-merge.ts: ratings.deleteOne',
            ].sort()
        );
    });

    it('nothing under mm/ imports the user or game repositories or calls the score route', () => {
        for (const { file, text } of ALL.filter(f => f.file.startsWith('pawlegends/mm/'))) {
            expect([file, /UserRepository|GameRepository|game\.repository|user\.repository/.test(text)]).toEqual([
                file,
                false,
            ]);
            expect([file, /catbassadors\/live/.test(text)]).toEqual([file, false]);
        }
    });

    it('the relay files never write a rating or a mm record through a model directly', () => {
        for (const { file, text } of ALL.filter(f => f.file.startsWith('pawlegends/party/'))) {
            expect([file, /PawlegendsRating|ratingModel/.test(text)]).toEqual([file, false]);
        }
    });
});
