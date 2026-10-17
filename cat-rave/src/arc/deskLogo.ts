/**
 * Arc week: the official white Arc logo on the DJ booth's front panel (the face the hero camera sees), on a
 * dark plate inset into the bright green light box so the mark keeps its contrast and clear space. The logo
 * is the brand-kit PNG, unmodified, shown as an emissive decal (no tint, no glow of its own); the plate's
 * thin neon rim is outside the clear space.
 */
import { Color, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { ARC_LOGO_ASPECT, ARC_LOGO_PNG, brandUrl } from './arcweek';

/** Plate and logo on the upper booth front (m; the booth is 2.4 m wide, 1.1 m tall): above the front row's paws. */
export const DESK_PLATE = Object.freeze({ w: 1.42, h: 0.48, y: 0.79 });
/** Logo height: the plate minus the clear space (inner-arch height, ~25% of the logo) on each side. */
export const DESK_LOGO_H = 0.28;

export interface ArcDeskLogo {
  group: Group;
  readonly loaded: boolean;
  setVisible(on: boolean): void;
  dispose(): void;
}

export function createArcDeskLogo(booth: { w: number; h: number; d: number }, loader: TextureLoader = new TextureLoader()): ArcDeskLogo {
  const group = new Group();
  group.name = 'arc-desk-logo';
  group.visible = false;
  const front = booth.d / 2 + 0.006; // just proud of the frame rails

  const rimGeo = new PlaneGeometry(DESK_PLATE.w + 0.05, DESK_PLATE.h + 0.05);
  const rimMat = new MeshBasicMaterial({ color: new Color(0.35, 1.2, 0.55), toneMapped: true });
  const rim = new Mesh(rimGeo, rimMat);
  rim.position.set(0, DESK_PLATE.y, front);

  const plateGeo = new PlaneGeometry(DESK_PLATE.w, DESK_PLATE.h);
  // Arc navy, darkened: the white logo needs a dark, calm field.
  const plateMat = new MeshBasicMaterial({ color: new Color(0x0b1730), toneMapped: true });
  const plate = new Mesh(plateGeo, plateMat);
  plate.position.set(0, DESK_PLATE.y, front + 0.002);

  const logoGeo = new PlaneGeometry(DESK_LOGO_H * ARC_LOGO_ASPECT, DESK_LOGO_H);
  // Invisible (opacity 0) until the texture arrives; never toggled with `visible`, which boot's shader
  // precompile flips on and back off for hidden objects.
  const logoMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, toneMapped: true, color: new Color(1, 1, 1) });
  const logo = new Mesh(logoGeo, logoMat);
  logo.position.set(0, DESK_PLATE.y, front + 0.004);
  logo.name = 'arc-desk-logo-mark';

  group.add(rim, plate, logo);
  let texture: Texture | null = null;
  let loaded = false;
  loader.load(
    brandUrl(ARC_LOGO_PNG),
    (t) => {
      t.colorSpace = SRGBColorSpace;
      t.minFilter = LinearFilter;
      t.generateMipmaps = false;
      texture = t;
      logoMat.map = t;
      logoMat.opacity = 1;
      logoMat.needsUpdate = true;
      loaded = true;
    },
    undefined,
    () => {
      // TODO: no logo file: the plate stays blank rather than showing an approximation.
      console.warn('[rave] Arc logo texture failed to load');
    },
  );

  return {
    group,
    get loaded() {
      return loaded;
    },
    setVisible(on) {
      group.visible = on;
    },
    dispose() {
      rimGeo.dispose();
      rimMat.dispose();
      plateGeo.dispose();
      plateMat.dispose();
      logoGeo.dispose();
      logoMat.dispose();
      texture?.dispose();
    },
  };
}
