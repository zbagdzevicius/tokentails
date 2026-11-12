import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/*
 * Friends chat (docs/plans/moba/CHAT-AVATARS.md §3). Server-authoritative: every message is written here by the API
 * (DMs) or by the relay's ChatSink (party chat). Messages and threads expire 30 days after their last activity (TTL on
 * `exp`). No IP, email, device or location is stored; names are derived at read time (display-name.ts), never stored.
 * Account deletion removes an account's messages, its DM threads and its party memberships (social-purge.ts).
 */

export const CHAT_THREADS_COLLECTION = 'pawlegendschatthreads';
export const CHAT_MESSAGES_COLLECTION = 'pawlegendschat';

@Schema({ collection: CHAT_THREADS_COLLECTION, versionKey: false })
export class PawlegendsChatThread {
    /** Opaque: `d<hash of the pair>` (DM) or `p<hash of the party code and start>` (party). Never an account id. */
    @Prop({ type: String, required: true })
    _id: string;

    /** `match` (MATCH-CHAT.md §3): a room's in-match lines, kept only so a line can be reported. */
    @Prop({ type: String, required: true, enum: ['dm', 'party', 'match'] })
    kind: 'dm' | 'party' | 'match';

    /** Account ids (party: registered members only; guests are never stored). */
    @Prop({ type: [String], required: true })
    members: string[];

    /** The last computed tier (display only: every send recomputes it). */
    @Prop({ type: String, enum: ['text', 'quick'], default: 'quick' })
    tier: 'text' | 'quick';

    @Prop({ type: Date, required: true })
    lastAt: Date;

    @Prop({ type: String, default: '' })
    lastFrom: string;

    /** 40 characters of text, or `[q:<id>]` / `[s:<id>]`. */
    @Prop({ type: String, default: '' })
    lastPreview: string;

    /** Per-member read cursor (account id → the last read message's time). */
    @Prop({ type: Object, default: {} })
    read: Record<string, Date>;

    /** Members who muted the thread (no badge, no notice). */
    @Prop({ type: [String], default: [] })
    muted: string[];

    /** DM: set when the friendship ended (unfriend or block); the thread is read-only for 24 h, then hidden. */
    @Prop({ type: Date, default: null })
    closedAt: Date | null;

    /** Who opened the DM thread (the new-threads-per-day cap). */
    @Prop({ type: String, default: '' })
    createdBy: string;

    @Prop({ type: Date, required: true })
    createdAt: Date;

    /** lastAt + 30 days (TTL). */
    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsChatThreadSchema = SchemaFactory.createForClass(PawlegendsChatThread);
PawlegendsChatThreadSchema.index({ members: 1, lastAt: -1 });
PawlegendsChatThreadSchema.index({ createdBy: 1, createdAt: -1 });
PawlegendsChatThreadSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: CHAT_MESSAGES_COLLECTION, versionKey: false })
export class PawlegendsChatMessage {
    /**
     * A 24-hex ObjectId string minted by the writer (API or relay), so a report can name a party message before the
     * batch flush. Stored as a string: clients only ever see this id, never the sender's account.
     */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, required: true })
    thread: string;

    /** The sender's account id (never returned to a client). */
    @Prop({ type: String, required: true })
    from: string;

    @Prop({ type: String, required: true, enum: ['t', 'q', 's'] })
    k: 't' | 'q' | 's';

    /** The normalised, filtered text (k = 't' only, at most 120 characters). */
    @Prop({ type: String, default: undefined, maxlength: 240 })
    text?: string;

    /** The phrase or sticker id (k = 'q' | 's'). */
    @Prop({ type: Number, default: undefined })
    id?: number;

    @Prop({ type: Date, required: true })
    at: Date;

    /** at + 30 days (TTL). */
    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsChatMessageSchema = SchemaFactory.createForClass(PawlegendsChatMessage);
PawlegendsChatMessageSchema.index({ thread: 1, at: -1 });
PawlegendsChatMessageSchema.index({ from: 1, at: -1 });
PawlegendsChatMessageSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

export const PAWLEGENDS_CHAT_SCHEMAS = [
    { name: PawlegendsChatThread.name, schema: PawlegendsChatThreadSchema },
    { name: PawlegendsChatMessage.name, schema: PawlegendsChatMessageSchema },
];
