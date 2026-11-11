import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/*
 * ChatBus (CHAT-AVATARS.md §5): the API publishes "a DM arrived for this account" and the party relay, when it runs in
 * the same process, turns it into a `chat.notice` frame on that account's sockets (no message body: the client reads
 * it over REST). With the relay on its own VM nothing subscribes, and the 30 s pulse and the 4 s open-thread poll
 * deliver instead; a cross-instance bus rides the party directory [infra].
 */

export interface ChatNotice {
    /** The recipient's account id (never sent to a client). */
    to: string;
    /** The opaque thread id. */
    thread: string;
}

@Injectable()
export class ChatBus {
    private readonly emitter = new EventEmitter();

    constructor() {
        this.emitter.setMaxListeners(20);
    }

    publish(notice: ChatNotice): void {
        try {
            this.emitter.emit('notice', notice);
        } catch {
            // a subscriber's failure never fails a send
        }
    }

    subscribe(fn: (notice: ChatNotice) => void): () => void {
        this.emitter.on('notice', fn);
        return () => this.emitter.off('notice', fn);
    }
}
