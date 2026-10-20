import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { buildTrack } from './build';
import { buildTrackMesh } from './mesh';
import { themeOf } from './themes';
import { TRACKS } from './tracks';
import { stuntLab } from '../../test/fixtures';
import { pieceSkin, registerPieceSkin } from '../../tracks/skins';

function meshes(def: Parameters<typeof buildTrack>[0]): Mesh[] {
  const t = buildTrack(def);
  const g = buildTrackMesh(t, themeOf(def.theme), { groundY: 0 });
  const out: Mesh[] = [];
  g.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

describe('set-piece meshes (SIM_VERSION 8)', () => {
  it('every track builds finite geometry; set pieces add at most the nets plus one moving skin part (skins/registry.ts)', () => {
    for (const def of [...TRACKS, stuntLab()]) {
      const ms = meshes(def);
      for (const m of ms) {
        const a = m.geometry.getAttribute('position').array;
        let bad = 0;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
        expect(bad, `${def.id} ${m.name}`).toBe(0);
      }
      const names = ms.map((m) => m.name).sort();
      // a skin may add one Object3D of its own per track (moving parts, named piece-*)
      expect(names.filter((n) => n.startsWith('piece-')).length, def.id).toBeLessThanOrEqual(1);
      const base = names.filter((n) => n !== 'track-nets' && !n.startsWith('piece-'));
      expect(base.every((n) => n === 'track-solid' || n === 'track-glow'), def.id).toBe(true);
      const jumps = (def.setPieces ?? []).filter((p) => p.kind === 'jump' && (p.gap ?? 10) > 0).length;
      expect(names.filter((n) => n === 'track-nets').length, def.id).toBe(jumps > 0 ? 1 : 0);
    }
  });

  it('the generic look grows the track mesh by a bounded amount (≈ 25 k vertices for one of each piece)', () => {
    const lab = stuntLab();
    const withPieces = meshes(lab).reduce((a, m) => a + m.geometry.getAttribute('position').count, 0);
    const without = meshes({ ...lab, setPieces: [] }).reduce((a, m) => a + m.geometry.getAttribute('position').count, 0);
    expect(withPieces - without).toBeGreaterThan(2000);
    expect(withPieces - without).toBeLessThan(25_000);
  });

  it('a registered skin is drawn for its theme and kind, and can replace the generic look', () => {
    let calls = 0;
    registerPieceSkin(0, 'tunnel', 15, (ctx) => {
      calls++;
      expect(ctx.piece.kind).toBe('tunnel');
      return true;
    });
    expect(pieceSkin(0, 'tunnel', 15)).not.toBeNull();
    expect(pieceSkin(1, 'tunnel', 15)).toBeNull();
    const lab = stuntLab();
    const plain = meshes(lab).reduce((a, m) => a + m.geometry.getAttribute('position').count, 0);
    const skinned = meshes({ ...lab, setPieces: lab.setPieces!.map((p) => (p.kind === 'tunnel' ? { ...p, skin: 15 } : p)) }).reduce((a, m) => a + m.geometry.getAttribute('position').count, 0);
    expect(calls).toBe(1);
    expect(skinned).toBeLessThan(plain);
  });
});
