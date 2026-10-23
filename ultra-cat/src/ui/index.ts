// META-UI lane registration point. main.ts calls registerMetaUi() LAST, after every registry is filled
// and core input is bound. It owns the whole menu flow from here.
import { initFlow } from './flow';

export function registerMetaUi(): void {
  initFlow();
}
