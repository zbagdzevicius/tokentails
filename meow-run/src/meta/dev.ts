// Tester shortcuts on window.__meow.dev. Owned by the META-UI lane; the five functions are CONTRACT (shots use them).
import * as session from '../core/session';
import { G } from '../core/state';
import type { StageId } from '../core/types';
import { play, reloadSave, save, setSave, setScreen } from '../ui/flow';
import { clearSave, loadSave, type SaveData } from './save';

export const dev = {
  /** unlock every stage (saved) */
  unlockAll(): void {
    setSave({ ...save, unlockAll: true });
  },
  /** start stageId at t (0..1 of the way to the finish; the run begins right there, briefly invulnerable, and respawns at the checkpoint at or before it) */
  jump(stageId: StageId, t = 0): void {
    play(stageId, t);
  },
  invincible(on = true): void {
    G.invincible = on;
  },
  /** wipe the save and go back to the title */
  reset(): void {
    clearSave();
    reloadSave();
    session.prepareStage('meadow');
    setScreen('title');
  },
  /** the stored save */
  save(): SaveData {
    return loadSave();
  },
};
