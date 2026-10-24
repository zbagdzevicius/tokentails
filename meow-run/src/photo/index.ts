// PHOTO lane entry (ITERATION2.md 6.2): photo mode from pause. Orbit / pan / roll camera, live filters, stickers,
// frames, poses (when the cat supports them) and a PNG with share / save. src/ugc/index.ts calls registerPhoto() once.
import { game } from '../core/state';
import { exposeTestHook, provide } from '../ugc/contract';
import { addButton } from '../ugc/hub';
import { ICON } from './icons';
import { initPhotoMode, openPhoto, photoApi } from './mode';

export function registerPhoto(): void {
  initPhotoMode();
  provide({ openPhoto });
  addButton({
    id: 'ugcPhoto',
    slot: 'pause',
    label: 'PHOTO',
    order: 10,
    icon: ICON.camera,
    visible: () => game.mode === 'paused',
    onClick: openPhoto,
  });
  exposeTestHook('photo', photoApi);
}
