/** Boot (GDD 1.1): straight onto the starting grid, no menu. */
import { Shell } from './core/app/shell';
import { installLanes } from './lanes';

const host = document.getElementById('app');
if (host) {
  const shell = new Shell(host);
  installLanes(shell);
  shell.start(shell.setupFromUrl());
  shell.run();
}
