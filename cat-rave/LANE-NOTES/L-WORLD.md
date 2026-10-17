# L-WORLD notes

No change to `types.ts` was needed. Requests and notes for other lanes:

- `createWorld` also returns `laserMode` and `postActive` (extra read-only fields, `WorldExtras`), handy for `?debug=1`.
- `world.update(frame)` applies `frame.profile` automatically when it changes (same as calling `setQuality`).
- `setLaserMode(mode)` is a manual override for 8 bars; otherwise the lasers follow the music (intro idle, groove sweep, build/hold fan, drop strobe then sweep/fan, breakdown idle). Reduced motion never strobes.
- `flash()` is rate limited to 3 starts per second; strength >= 0.8 also sends a glow ring across the floor.
- `setSpotTarget(v)` keeps the reference, so passing a vector you keep updating makes the follow spot track it.
- Sky and moon are drawn on the far plane, so any `camera.far` works; the floor is 140 m, so far >= 150 is recommended.
- With bloom the composer does ACES tone mapping (renderer `NoToneMapping`); on low the renderer does ACES. Custom shaders should end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` to look right on both.
- Scene fog is `FogExp2` (density 0.0135, dark green). Use three's fog chunks (`fog: true`) and the crowd fades into the horizon haze.
- High tier renders a half-res planar mirror of the whole scene (haze hidden). Crowd/DJ vertex-shader animation shows in it for free; the cost scales with cat count.
- Gap: the floor does not glow under each cat (no cat positions in WorldApi). If wanted, add `world.setFloorGlowRadius(r)` or similar to types.
