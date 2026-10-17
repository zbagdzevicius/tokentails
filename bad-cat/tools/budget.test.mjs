import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseOf, distPath, firstLoadAssets, isLazyName, kb, summarize } from './lib/budget-lib.mjs';

const HTML = `<head>
<script type="module" crossorigin src="/badcat-game/build/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/badcat-game/build/rolldown-runtime-B.js">
<link rel="modulepreload" crossorigin href="/badcat-game/build/three-C.js">
<link rel="stylesheet" crossorigin href="/badcat-game/build/index-D.css">
<link rel="icon" href="/badcat-game/icon.svg" />
<link rel="manifest" href="/badcat-game/manifest.webmanifest" />
<script src="https://cdn.example/x.js" type="module"></script>
</head>`;

test('firstLoadAssets: entry, modulepreloads and stylesheets only', () => {
  assert.deepEqual(firstLoadAssets(HTML), [
    '/badcat-game/build/index-AAA.js',
    '/badcat-game/build/rolldown-runtime-B.js',
    '/badcat-game/build/three-C.js',
    '/badcat-game/build/index-D.css',
  ]);
});

test('base detection and dist paths for absolute and relative bases', () => {
  const urls = firstLoadAssets(HTML);
  assert.equal(baseOf(urls), '/badcat-game/');
  assert.equal(distPath(urls[0], '/badcat-game/'), 'build/index-AAA.js');
  assert.equal(distPath('./build/index-AAA.js', './'), 'build/index-AAA.js');
  assert.equal(baseOf(['./build/x.js']), './');
  assert.equal(distPath('/build/x.js', '/'), 'build/x.js');
});

test('lazy chunk names', () => {
  for (const f of ['build/share-x.js', 'build/clip-pass-1.js', 'build/editor-2.js', 'build/mediabunny-3.js', 'build/encoder-webcodecs-4.js', 'build/gif-5.js']) assert.ok(isLazyName(f), f);
  for (const f of ['build/index-x.js', 'build/three-y.js', 'build/rolldown-runtime-z.js']) assert.ok(!isLazyName(f), f);
});

test('summarize: first-load JS sums entry + three + runtime, lazy and CSS excluded', () => {
  const files = [
    { file: 'build/index-AAA.js', raw: 1, gzip: 240_000 },
    { file: 'build/three-C.js', raw: 1, gzip: 133_000 },
    { file: 'build/rolldown-runtime-B.js', raw: 1, gzip: 400 },
    { file: 'build/index-D.css', raw: 1, gzip: 6_500 },
    { file: 'build/share-E.js', raw: 1, gzip: 90_000 },
  ];
  const first = firstLoadAssets(HTML).map((u) => distPath(u, '/badcat-game/'));
  const s = summarize(files, first);
  assert.equal(s.firstJs, 373_400);
  assert.equal(s.firstCss, 6_500);
  assert.equal(s.over, false);
  assert.deepEqual(s.lazyLeak, []);
  assert.equal(summarize(files, first, 300).over, true);
  // a lazy chunk preloaded by index.html is reported and not counted
  const leak = summarize(files, [...first, 'build/share-E.js']);
  assert.deepEqual(leak.lazyLeak, ['build/share-E.js']);
  assert.equal(leak.firstJs, 373_400);
  assert.equal(kb(373_400), '373.4 KB');
});
