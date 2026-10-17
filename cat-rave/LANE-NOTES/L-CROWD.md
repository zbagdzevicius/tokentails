# L-CROWD notes

## Done
- `src/crowd/index.ts` `createCrowd(world, profile): CrowdApi` (signature unchanged).
- `src/crowd/catGeometry.ts`: one merged low-poly kitten (~420 tris), per-vertex `aPart` (body, head, ear, arm, paw, foot, tail).
- `src/crowd/shaders.ts`: all dance in the vertex shader (bounce/squash on the kick, alternating paw waves, synced pump on the
  drop, crouch + shake in the build, head nod, sway, tail, tap ripple, vortex flight, drop-in from the sky). Far cats are
  camera-facing SDF impostors with the same pose maths. Fog + tone mapping chunks included.
- `src/crowd/slots.ts`: stable hex slots (booth out, +Z first; `buildSlots(n)` is a prefix of `buildSlots(m)`), vortex maths
  mirrored on CPU (`catAxis`), looks from the seed (`catLook`).
- `src/crowd/pick.ts`: CPU ray vs capsules, uniform grid on the floor, brute force while the vortex is active.
- `src/crowd/crowd.test.ts`: 12 tests (slot stability/order/spacing, vortex, picking incl. occlusion and top-down vortex).

## Contract details for other lanes
- `catPosition(i, out)` returns the cat's CENTRE (y ≈ 0.45 × scale, plus vortex lift), not its feet.
- `highlight(i)` also shows a green beacon beam and a pink floor ring that follow the cat. One index only (API); for a tx with
  several cats, L-UI can cycle or highlight the first.
- `dropIn(i)`: several calls in one frame are staggered 0.28 s each; resolves on landing; a shockwave ring + paw pulse on touchdown.
- `jump(strength, origin)`: ripple from `origin` (x/z), else from the booth.
- `setNextCat(p)`: hologram in slot `shown` filling bottom-up to p, plus ghost paw prints on the next 12 slots (only while
  shown < 600). Hidden when the floor is at capacity.
- Build/drop come from `frame.beat` (`held`, `section`, `sectionProgress`); the crowd pulses its paws itself on entering `drop`.
- `setQuality(p)` trims to `p.maxCats` and changes the near/impostor split; main's `setProfile` does not call it yet (L-UI).
- LOD: nearest `nearCats` by camera distance, re-sorted every 0.25 s only while the camera moves or the vortex runs (quickselect, O(n)).

## Seen in the browser (Oct 16)
- `?cats=300`, `?cats=10000` (hero, top + vortex), real 10 cats (orbit, highlight, drop-in): no console errors.
- The `top` shot at 10k cats frames r ≈ 67 from very high, so world fog darkens the crowd to green; L-UI/L-WORLD may want a
  lower top camera or less fog for that shot.
- The `hero` shot on a phone with 10 cats sits very close to the booth (crowd cats fall out of frame), L-UI framing.
