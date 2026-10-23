import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HEADER_RE, LISTED, PORTED, PORT_HEADER_RE, destMap, header, portHeader, rewriteImports, unmarkedPorts } from './lift-ppk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('lift-ppk', () => {
  it('rewrites relative imports to the pawlegends layout', () => {
    const map = destMap();
    const r = rewriteImports("import { CAMERA } from '../core/config.js';\nimport x from './tricks.css?inline';", 'src/ui/touch.js', map);
    expect(r.missing).toEqual([]);
    expect(r.text).toContain("from '../../render/ppk/core/config.js'");
    expect(r.text).toContain("from '../../render/ppk/ui/tricks.css?inline'");
    const bad = rewriteImports("import { y } from './nowhere.js';", 'src/ui/touch.js', map);
    expect(bad.missing.length).toBe(1);
  });
  it('headers carry commit, source path and licence note', () => {
    expect(header('7714dcb', 'src/camera/IsoRig.js', 'listed')).toMatch(HEADER_RE);
    expect(header('7714dcb', 'src/ui/ui.css', 'listed').startsWith('/*')).toBe(true);
  });
  it('every lifted file in the tree has its provenance header (§15 item 26)', () => {
    const map = destMap();
    for (const dest of map.values()) {
      const text = fs.readFileSync(path.join(ROOT, dest), 'utf8');
      expect(HEADER_RE.test(text.slice(0, 400)), dest).toBe(true);
      expect(text).toContain('all rights reserved, pending founder decision');
    }
    expect(LISTED.length).toBe(20);
  });
  it('ported files carry a "Ported from" header and no other file claims to port PPK code', () => {
    expect(portHeader('7714dcb', 'src/physics/Pathfind.js')).toMatch(PORT_HEADER_RE);
    for (const [, dest] of PORTED) {
      const text = fs.readFileSync(path.join(ROOT, dest), 'utf8');
      expect(PORT_HEADER_RE.test(text.slice(0, 400)), dest).toBe(true);
      expect(text).toContain('all rights reserved, pending founder decision');
    }
    expect(unmarkedPorts(ROOT)).toEqual([]);
  });
});
