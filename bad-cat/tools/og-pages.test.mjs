import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIC_PAGES, dayOgDescription, dayOgTitle, escapeHtml, joinUrl, metaBlock, pageHtml, publicOrigin, stripMeta } from './lib/og-meta.mjs';

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Bad Cat Daily</title>
    <meta name="description" content="old" />
    <meta property="og:title" content="Bad Cat Daily" />
    <script type="module" crossorigin src="./build/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="./build/three-x.js">
    <link rel="icon" href="/badcat-game/icon.svg" />
  </head>
  <body><div id="app"></div></body>
</html>
`;
const META = { title: 'Kitchen #18 · Breakfast Heist · can your cat wreck it?', description: 'Chef Dad is home.', url: 'https://tokentails.com/badcat/d/18', image: 'https://tokentails.com/badcat-game/og/d/18.png' };

test('escapeHtml escapes the five HTML characters', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(escapeHtml(undefined), '');
});

test('day title follows GDD 7.4 and boss days have no separate name', () => {
  assert.equal(dayOgTitle({ label: 'Kitchen #18', title: 'Kitchen #18: Breakfast Heist' }), 'Kitchen #18 · Breakfast Heist · can your cat wreck it?');
  assert.equal(dayOgTitle({ label: 'Boss: Wedding Cake #13', title: 'Boss: Wedding Cake #13' }), 'Boss: Wedding Cake #13 · can your cat wreck it?');
  assert.match(dayOgDescription({ human: 'Chef Dad', twist: 'The stove timer warns before he turns' }), /^Chef Dad is home\. The stove timer warns before he turns\. /);
});

test('pageHtml replaces the template tags with exactly one escaped block', () => {
  const html = pageHtml(TEMPLATE, { ...META, title: `New Year's <Party> & "cake"` });
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/og:title/g) ?? []).length, 1);
  assert.equal((html.match(/name="description"/g) ?? []).length, 1);
  assert.ok(html.includes('<title>New Year&#39;s &lt;Party&gt; &amp; &quot;cake&quot;</title>'));
  assert.ok(!html.includes('<Party>'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
  assert.ok(html.includes(`<meta property="og:image" content="${META.image}" />`));
  assert.ok(html.indexOf('badcat:og') < html.indexOf('</head>'));
  assert.ok(html.includes('<div id="app"></div>'));
});

test('pageHtml is idempotent at depth 0', () => {
  const once = pageHtml(TEMPLATE, META);
  assert.equal(pageHtml(once, META), once);
  assert.equal(pageHtml(pageHtml(once, { ...META, title: 'other' }), META), once);
});

test('nested pages move relative asset URLs up; absolute ones stay', () => {
  const html = pageHtml(TEMPLATE, META, 1);
  assert.ok(html.includes('src="../build/index-abc.js"'));
  assert.ok(html.includes('href="../build/three-x.js"'));
  assert.ok(html.includes('href="/badcat-game/icon.svg"'));
});

test('stripMeta removes a previous block and template tags', () => {
  const s = stripMeta(pageHtml(TEMPLATE, META));
  assert.ok(!/<title>|og:|twitter:|badcat:og|canonical/.test(s));
  assert.ok(s.includes('<meta charset="UTF-8" />'));
});

test('a template without </head> is rejected', () => {
  assert.throws(() => pageHtml('<html><body></body></html>', META));
});

test('metaBlock carries noindex only when asked', () => {
  assert.ok(!metaBlock(META).includes('noindex'));
  assert.ok(metaBlock({ ...META, noindex: true }).includes('<meta name="robots" content="noindex" />'));
});

test('static pages cover every link shell of GDD 6.6', () => {
  const files = STATIC_PAGES.map((p) => p.file).sort();
  assert.deepEqual(files, ['c.html', 'glass.html', 'maker.html', 'pick.html', 'r.html', 'redeem.html', 'restore.html', 'thanks.html']);
  for (const p of STATIC_PAGES.filter((x) => ['thanks.html', 'redeem.html', 'restore.html'].includes(x.file))) assert.equal(p.noindex, true);
});

test('publicOrigin and joinUrl', () => {
  assert.equal(publicOrigin(undefined), 'https://tokentails.com');
  assert.equal(publicOrigin('javascript:alert(1)'), 'https://tokentails.com');
  assert.equal(publicOrigin('https://staging.tokentails.com/'), 'https://staging.tokentails.com');
  assert.equal(joinUrl('https://a.com/', '/badcat-game/og/x.png'), 'https://a.com/badcat-game/og/x.png');
});
