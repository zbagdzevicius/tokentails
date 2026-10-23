// Apply a city's look to the scene. Owned by the CAMPAIGN lane.
// CONTRACT: applyTheme(theme) is called by core/session.prepareLevel before city.build().
import * as THREE from 'three';
import { themeExtras } from '../campaign/themes';
import { hemi, renderer, scene, sun } from '../core/engine';
import { city } from '../core/world';
import type { CityTheme } from '../core/types';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function applyTheme(t: CityTheme): void {
  const x = themeExtras(t);
  (scene.background as THREE.Color).setHex(t.sky);
  const fog = scene.fog as THREE.Fog;
  fog.color.setHex(t.sky); // fog always matches the sky so the city edge melts away
  fog.near = t.fogNear;
  fog.far = t.fogFar;
  hemi.color.setHex(t.hemiSky);
  hemi.groundColor.setHex(t.hemiGround);
  hemi.intensity = t.hemiIntensity;
  sun.color.setHex(t.sunColor);
  sun.intensity = t.sunIntensity;
  renderer.toneMappingExposure = t.exposure;
  city.win.uLit.value = t.windowLit;
  city.win.uGlass.value.setHex(t.windowGlass);
  city.win.uGlow.value.setHex(t.windowGlow);
  city.win.uGlow2.value.setHex(x.glow2);
  city.win.uEmit.value = x.emit;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', hex(t.sky));
  document.body.style.background = hex(t.sky);
}
