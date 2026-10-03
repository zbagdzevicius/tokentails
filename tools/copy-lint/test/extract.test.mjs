import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractJson, extractTs } from '../lib/extract.mjs';

const texts = (src, opts) => extractTs('x.tsx', src, opts).map((u) => u.text);

test('JSX text is one unit per block element, with inline children joined', () => {
  const src = `export const A = () => (
    <div className="p-4">
      <p>
        <strong>Digital cards:</strong>{" "}
        collect them all.
      </p>
      <h2>Second <span className="x">block</span></h2>
    </div>
  );`;
  assert.deepEqual(texts(src), ['Digital cards: collect them all.', 'Second block']);
});

test('a block with only inline children under 160 characters is one unit', () => {
  const src = `export const A = () => (<div><span>800+</span><span>strays saved</span></div>);`;
  assert.deepEqual(texts(src), ['800+ strays saved']);
});

test('class names, imports, keys, comparisons, console and fetch arguments are not copy', () => {
  const src = `import x from "some module path";
    const a = cn("px-4 py-2 text-white", cond && "bg-black");
    const b = { "label key": 1 }[k];
    if (mode === "airdrop mode") console.log("debug airdrop output");
    fetch("/api/some thing");
    export const B = () => <div className="flex items-center gap-2" data-testid="give treat" />;`;
  assert.deepEqual(texts(src), []);
});

test('template spans keep their shape, text attributes and text props are read', () => {
  const src = 'const t = `You rescued ${name}!`;\nconst o = { label: "Treats" };\nexport const C = () => <img alt="A shelter cat" src="/x.png" />;';
  assert.deepEqual(texts(src), ['You rescued {name}!', 'Treats', 'A shelter cat']);
});

test('isApp branches mark the web branch web-only', () => {
  const units = extractTs('x.tsx', 'export const A = () => <p>{isApp ? "In the app now" : "On the web now"}</p>;');
  assert.deepEqual(units.map((u) => [u.text, u.webOnly, u.appOnly]), [['In the app now', false, true], ['On the web now', true, false]]);
});

test('backend rule set reads message, label, name, description, revealTitle, exceptions and HTML only', () => {
  const src = `const a = { message: 'Claimed it', label: 'Label here', title: 'not read here', revealTitle: 'Vault' };
    throw new BadRequestException('Bad input given');
    const html = '<p>Hello friend</p>';
    const other = 'Plain prose string ignored';`;
  assert.deepEqual(texts(src, { ruleset: 'backend' }), ['Claimed it', 'Label here', 'Vault', 'Bad input given', 'Hello friend']);
});

test('JSON prose strings with line numbers and the object claim', () => {
  const units = extractJson('x.json', '{\n  "id": "abc",\n  "claim": "F-011",\n  "description": "Token Tails cat badge"\n}');
  assert.deepEqual(units.map((u) => [u.text, u.line, u.claim]), [['Token Tails cat badge', 4, 'F-011']]);
});
