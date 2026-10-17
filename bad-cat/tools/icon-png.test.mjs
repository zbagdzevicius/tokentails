import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIcon } from './icon-png.mjs';

test('icon-png writes a valid PNG of the requested size', () => {
  const png = renderIcon(32);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
});
