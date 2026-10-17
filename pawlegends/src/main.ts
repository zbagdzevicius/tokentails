/**
 * Boot (POC.md §3): crash overlay, embed handshake, then the app (quality probe, renderer, lobby, title → pick →
 * match → results). The match runs the sim in the LocalHost Worker (src/host/).
 */
import { App } from './app/app';
import { installCrashOverlay, showCrash } from './app/crash';
import { installBridge } from './embed/bridge';
import './ui/ui.css';

function boot(): void {
  installCrashOverlay();
  const bridge = installBridge();
  const app = document.getElementById('app');
  if (!app) throw new Error('no #app element');
  new App(app, bridge);
}

try {
  boot();
} catch (e) {
  showCrash(e);
}
