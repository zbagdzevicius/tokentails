/** The static world for one track: sky, fog, lights, ground, track mesh, theme dressing (render-only). */
import { Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, PlaneGeometry, type Scene } from 'three';
import type { BuiltTrack } from '../track/build';
import { buildTrackMesh, disposeGroup } from '../track/mesh';
import { nightTheme, themeOf, type Theme } from '../track/themes';
import { skyDome, stars } from '../track/dressing/common';
import { dressKitchen } from '../track/dressing/kitchen';
import { dressRooftops, ROOF_GROUND } from '../track/dressing/rooftops';
import { toonMaterial } from './toon';

export interface WorldView {
  group: Group;
  theme: Theme;
  sun: DirectionalLight;
  dispose(): void;
}

/**
 * `night` (iteration 4, F11: the Night Wild Card, `Modifier.Night`) turns a day theme after dark (`nightTheme`): the
 * night sky, the warm fill light, stars over every theme (Kitchen and Rooftops included) and neon wall tops.
 */
export function buildWorldView(scene: Scene, t: BuiltTrack, night = false): WorldView {
  const base = themeOf(t.def.theme);
  const theme = night ? nightTheme(base) : base;
  const group = new Group();
  group.name = 'world';
  scene.background = new Color(theme.skyHorizon);
  scene.fog = new Fog(theme.fog, theme.fogNear, theme.fogFar);
  group.add(skyDome(theme));

  const hemi = new HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
  group.add(hemi);
  const sun = new DirectionalLight(theme.sun, theme.sunIntensity);
  sun.position.set(60, 120, 40);
  group.add(sun);
  group.add(sun.target);
  // night tracks: a warm fill from the other side, so karts, cats and coins never read as dark silhouettes on a dark
  // road (one extra light, no shadows)
  if (theme.night) {
    const fill = new DirectionalLight(0xffe6d0, 0.95);
    fill.position.set(-70, 60, -50);
    group.add(fill);
  }

  const groundY = t.def.theme === 1 ? ROOF_GROUND : 0;
  group.add(buildTrackMesh(t, theme, { groundY }));
  // a day theme made night: stars, whatever the dressing (night themes keep their own sky as before)
  if (theme.night && !base.night) group.add(stars(400, 5));
  if (t.def.theme === 0) group.add(dressKitchen(t, theme));
  else if (t.def.theme === 1) group.add(dressRooftops(t, theme));
  else {
    const ground = new Mesh(new PlaneGeometry(800, 800), toonMaterial({ color: theme.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    group.add(ground);
    if (base.night) group.add(stars(400, 5));
  }
  if (t.def.theme === 1) {
    const street = new Mesh(new PlaneGeometry(900, 900), toonMaterial({ color: 0x120c28 }));
    street.rotation.x = -Math.PI / 2;
    street.position.y = ROOF_GROUND;
    group.add(street);
  }
  scene.add(group);
  return {
    group,
    theme,
    sun,
    dispose() {
      scene.remove(group);
      disposeGroup(group);
    },
  };
}
