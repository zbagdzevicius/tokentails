import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { PawlegendsNotice } from '../party/room-store';

/*
 * ChatBus (CHAT-AVATARS.md §5): the API publishes "a DM arrived for this account" and the party relay turns it into a
 * `chat.notice` frame on that account's sockets (no message body: the client reads it over REST). In one process
 * (BACKEND_ROLE `all`) the relay hears it at once; every notice is also written to `pawlegendsnotices`
 * (LIVE-MATCH-DEPLOYS.md §15), which every relay polls each second for its own accounts, so a DM sent through one API
 * instance reaches a player on any relay (two `all` instances, the relay shards, the GCP relay VM). Each notice carries
 * one id, so a relay that got it both ways sends it once. The 30 s pulse and the 4 s open-thread poll stay the fallback.
 */

export interface ChatNotice {
    /** The recipient's account id (never sent to a client). */
    to: string;
    /** The opaque thread id. */
    thread: string;
    /** One id per notice (the in-process event and the stored row carry the same one). */
    id?: string;
}

/** Inserts a notice row (the Mongo model; absent in specs and in processes without the party schemas). */
export interface NoticeWriter {
    create(doc: { _id: string; to: string; thread: string; at: Date }): Promise<unknown>;
}

@Injectable()
export class ChatBus {
    private readonly emitter = new EventEmitter();

    constructor(@Optional() @InjectModel(PawlegendsNotice.name) private readonly notices?: NoticeWriter) {
        this.emitter.setMaxListeners(20);
    }

    publish(notice: ChatNotice): void {
        const n = { ...notice, id: notice.id ?? randomBytes(12).toString('hex') };
        try {
            this.emitter.emit('notice', n);
        } catch {
            // a subscriber's failure never fails a send
        }
        // fire and forget: a lost row only means the pulse delivers it instead
        try {
            void Promise.resolve(this.notices?.create({ _id: n.id, to: n.to, thread: n.thread, at: new Date() })).catch(
                () => undefined
            );
        } catch {
            // never fails a send
        }
    }

    subscribe(fn: (notice: ChatNotice) => void): () => void {
        this.emitter.on('notice', fn);
        return () => this.emitter.off('notice', fn);
    }
}
