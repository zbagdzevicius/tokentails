// META-UI lane entry. Called once by main.ts after the registries are filled and input is bound.
// Must leave a stage prepared (session.prepareStage) so the title screen has an attract background.
import * as session from '../core/session';
import { initFlow } from './flow';
import { initHud } from './hud';
import { initTutorial } from './tutorial';

export function registerMetaUi(): void {
  initHud();
  initTutorial();
  initFlow();
  session.prepareStage('meadow');
}
