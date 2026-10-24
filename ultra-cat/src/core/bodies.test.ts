import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Particles } from './bodies';

const make = (cap = 8) => new Particles(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), cap);

describe('Particles (packed pool)', () => {
  it('draws only live particles and compacts dead ones away', () => {
    const p = make();
    p.spawn(0, 5, 0, 0, 0, 0, 1, 1, 0xff0000);
    p.spawn(1, 5, 0, 0, 0, 0, 0.1, 1, 0x00ff00);
    p.spawn(2, 5, 0, 0, 0, 0, 1, 1, 0x0000ff);
    p.step(0.016);
    expect(p.mesh.count).toBe(3);
    p.step(0.2); // the 0.1 s one dies
    expect(p.alive()).toBe(2);
    expect(p.mesh.count).toBe(2);
    // the last one moved into the dead slot, colour included
    const c = new THREE.Color();
    p.mesh.getColorAt(1, c);
    expect(c.getHex()).toBe(0x0000ff);
    expect(p.pos[3]).toBe(2);
  });
  it('overwrites round-robin when full and clears to zero', () => {
    const p = make(4);
    for (let i = 0; i < 6; i++) p.spawn(i, 5, 0, 0, 0, 0, 1, 1, 0xffffff);
    expect(p.alive()).toBe(4);
    p.clear();
    p.step(0.016);
    expect(p.alive()).toBe(0);
    expect(p.mesh.count).toBe(0);
  });
});
