/** items-ai lane install (src/lanes.ts): adds the item views to the shell's juice bus. */
import type { Shell } from '../../core/app/shell';
import { ItemView } from './item-view';

export function installItemsAi(shell: Shell): ItemView {
  const snap = { x: 0, y: 0, z: 0, heading: 0 };
  const view = new ItemView({
    scene: shell.stage.scene,
    overlay: shell.host,
    kartAt: (i, alpha) => (shell.view && shell.view.cur[i] ? shell.view.lerpKart(i, alpha, snap) : null),
    burst: (k, color, n, speed) => {
      const s = shell.world?.st.karts[k];
      if (s && shell.view) shell.view.burst(s.x, s.y + 0.4, s.z, color, n, speed);
    },
  });
  shell.bus.add(view);
  return view;
}
