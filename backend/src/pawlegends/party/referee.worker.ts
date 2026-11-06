/*
 * worker_threads entry of the party referee (MULTIPLAYER.md §3.3, D13): every sim step of the relay's rooms runs here,
 * never on the main thread. Relative imports only: loaded by path, without the `src/` alias.
 */
import { parentPort } from 'worker_threads';
import { RefereeHost, type RefereeIn } from './referee-host';

const host = new RefereeHost(m => parentPort?.postMessage(m));
parentPort?.on('message', (m: RefereeIn) => host.handle(m));
