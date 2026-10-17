import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCat, mergeGallery, normalizeSnapshot } from './lib/pink-paw-sync.mjs';

const MILA = { id: '6992227d890a12f52a317e22', name: 'Mila', status: 'WAITING', pattern: 'tabby', base: '#AABBCC', secondary: '#112233', tertiary: '#ffffff', eyes: 2, bio: 'Grey tabby. Waiting at Pink Paw.', adoptUrl: 'https://tokentails.com/cats/6992227d890a12f52a317e22', photo: 'pink-paw/mila.jpg' };
const PREV = { asOf: '2026-10-04', shelter: 'Pink Paw', source: 's', cats: [MILA, { ...MILA, id: '69a5341d3ee4d7b657941bb8', name: 'Medutis', photo: 'https://evil.example/x.jpg' }] };

test('cleanCat drops bad ids and remote photos, lowercases colours', () => {
  assert.equal(cleanCat({ ...MILA, id: 'nope' }), null);
  assert.equal(cleanCat({ ...MILA, pattern: 'plaid' }), null);
  assert.equal(cleanCat(MILA).base, '#aabbcc');
  assert.equal(cleanCat(PREV.cats[1]).photo, null);
});

test('normalizeSnapshot keeps the snapshot when re-emitted', () => {
  const n = normalizeSnapshot(PREV);
  assert.equal(n.cats.length, 2);
  assert.deepEqual(normalizeSnapshot(n), n);
});

test('mergeGallery: status changes, new cats get a flagged coat, missing cats are kept', () => {
  const r = mergeGallery(PREV, { atShelter: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Naujas', status: null }], adopted: [{ id: MILA.id, name: 'Mila', status: 'ADOPTED' }] }, { asOf: '2026-10-16', source: 'test' });
  assert.deepEqual(r.added, ['aaaaaaaaaaaaaaaaaaaaaaaa']);
  assert.deepEqual(r.changed, [MILA.id]);
  assert.deepEqual(r.missing, ['69a5341d3ee4d7b657941bb8']);
  const mila = r.snapshot.cats.find((c) => c.id === MILA.id);
  assert.equal(mila.status, 'ADOPTED');
  assert.equal(mila.bio, 'Grey tabby. Found a home.');
  assert.equal(mila.photo, 'pink-paw/mila.jpg');
  const fresh = r.snapshot.cats.find((c) => c.name === 'Naujas');
  assert.equal(fresh.status, 'WAITING');
  assert.equal(fresh.coatGuess, true);
  assert.equal(fresh.photo, null);
  assert.equal(r.snapshot.asOf, '2026-10-16');
});
