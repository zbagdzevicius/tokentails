// node --test scripts/__tests__/
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME_INDEX, addedBuildPaths, otaPath, purgeBatches, waitForOrigin } from '../cdn-cache.mjs';

describe('cdn-cache (LATENCY-PLAN C5)', () => {
    it('OTA manifest paths', () => {
        assert.equal(otaPath('manifest-beta.json'), '/pawlegends-app/updates/ios/1/manifest-beta.json');
        assert.equal(otaPath('manifest.json', 'ios', '2'), '/pawlegends-app/updates/ios/2/manifest.json');
        assert.equal(GAME_INDEX, '/pawlegends-game/index.html');
    });

    it('warms only build files added by the deploy (not removed or modified, not nested or outside build/)', () => {
        const diff = [
            'A\tclient/public/pawlegends-game/build/index-AbC123.js',
            'A\tclient/public/pawlegends-game/build/three-x_y-Z.js',
            'D\tclient/public/pawlegends-game/build/index-Old.js',
            'M\tclient/public/pawlegends-game/build-releases.json',
            'A\tclient/public/pawlegends-game/assets/x.png',
            'A\tclient/public/pawlegends-game/build/sub/deep.js',
            '',
        ].join('\n');
        assert.deepEqual(addedBuildPaths(diff), ['/pawlegends-game/build/index-AbC123.js', '/pawlegends-game/build/three-x_y-Z.js']);
    });

    it('purges in batches of 30 URLs (the Cloudflare API limit)', () => {
        const urls = Array.from({ length: 65 }, (_, i) => `https://x/${i}`);
        const b = purgeBatches(urls);
        assert.deepEqual(
            b.map(x => x.files.length),
            [30, 30, 5]
        );
        assert.deepEqual(purgeBatches([]), []);
    });

    it('waits for the origin to serve the new content (cache-busted), and gives up after the timeout', async () => {
        const seen = [];
        let n = 0;
        const fetchImpl = async url => {
            seen.push(url);
            n++;
            return { ok: true, text: async () => (n >= 3 ? '{"version":"new"}' : '{"version":"old"}') };
        };
        assert.equal(await waitForOrigin('https://s/m.json', b => JSON.parse(b).version === 'new', { everyMs: 1, fetchImpl }), true);
        assert.equal(n, 3);
        assert.ok(seen.every(u => /\?cb=\d+$/.test(u)));
        const never = await waitForOrigin('https://s/m.json', () => false, { everyMs: 1, timeoutMs: 5, fetchImpl });
        assert.equal(never, false);
    });
});
