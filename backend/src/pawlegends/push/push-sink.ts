import type { PushMessage } from './push.rules';

/*
 * The one way other services send a push (docs/plans/moba/SHARE-PUSH.md §2): a friend's party invite (social), a club
 * chest tier reached (clubs), ranked opening (ranked/status). PushService registers itself when Nest starts it; without
 * it (tests, the relay process) these are no-ops. They never throw and never wait for the push services: a push is
 * never part of the action that caused it.
 */

export interface PushSink {
    notify(accountIds: readonly string[], msg: PushMessage): Promise<void>;
    broadcast(msg: PushMessage): Promise<void>;
}

let sink: PushSink | null = null;

/** PushService.onModuleInit; tests pass null to reset. */
export function setPushSink(s: PushSink | null): void {
    sink = s;
}

export function pushNotify(accountIds: readonly string[], msg: PushMessage): void {
    if (!sink || !accountIds.length) return;
    void sink.notify(accountIds, msg).catch(() => undefined);
}

export function pushBroadcast(msg: PushMessage): void {
    if (!sink) return;
    void sink.broadcast(msg).catch(() => undefined);
}
