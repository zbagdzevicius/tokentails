/**
 * Boot (GDD 1.1): lanes install, then the race from the URL starts on the grid. Deep links (`#g=`, `?t=`, `?daily`,
 * `?make`, `/meow-race/*`) always go straight to their race or editor; the modes lane may put a title screen in front
 * of a plain visit through the screen stack.
 */
import { Shell } from './core/app/shell';
import { installLanes } from './lanes';

const host = document.getElementById('app');
if (host) {
  const shell = new Shell(host);
  installLanes(shell);
  shell.start(shell.setupFromUrl());
  shell.run();
}
