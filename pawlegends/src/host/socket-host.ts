/**
 * The LocalHost loop behind a WebSocket-shaped transport (POC.md §11.2, §15 item 13): the same TickLoop the Worker
 * runs, speaking the wire format of protocol.ts (`encodeWire` / `decodeWire`). The Phase 2 pawlegends-server will
 * serve this over a real socket; in the POC it backs the transport-equivalence test.
 */
import { decodeWire, encodeWire, isClientMsg, type WireFrame } from './protocol';
import { TickLoop, type TickLoopEnv } from './tick-loop';

/** The bits of a WebSocket (server or client end) this needs. */
export interface SocketLike {
  send(frame: WireFrame): void;
  addEventListener(type: 'message', fn: (e: { data: WireFrame }) => void): void;
}

export function serveOverSocket(socket: SocketLike, env: Omit<TickLoopEnv, 'post'>): TickLoop {
  const loop = new TickLoop({ ...env, post: (msg) => socket.send(encodeWire(msg)) });
  socket.addEventListener('message', (e) => {
    const msg = decodeWire(e.data);
    if (msg && isClientMsg(msg)) loop.handle(msg);
  });
  return loop;
}
