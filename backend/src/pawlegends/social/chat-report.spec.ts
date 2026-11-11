import { ReportService } from './report.service';
import { REPORT_REASONS, SANCTION_KINDS, STORED_REPORT_REASONS } from './report.contracts';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

/*
 * Chat reports in the moderator view (CHAT-AVATARS.md §3.4): the detail shows the copied snapshot and sub-reason, the
 * list groups and filters them, F6 marks 20 filter hits today, and `chat_mute` resolves timed (1/7/30 days) or
 * permanent. A PvP report can never carry the `chat` reason.
 */

function harness() {
    const clock = new TestClock();
    const reports = new SocialMemoryModel([], [], clock.now);
    const sanctions = new SocialMemoryModel([], [], clock.now);
    const rooms = new SocialMemoryModel([], [], clock.now);
    const buyers = new SocialMemoryModel([], [], clock.now);
    const social = new SocialMemoryModel(
        [
            {
                _id: 'T',
                code: 'TTTTTTTT',
                rev: 0,
                chatStrikes: { day: new Date(clock.ms).toISOString().slice(0, 10), n: 21 },
            },
        ],
        [{ fields: ['_id'] }],
        clock.now
    );
    const svc = new ReportService(reports, sanctions, rooms, buyers, social, undefined, clock);
    return { svc, reports, sanctions, clock };
}

const chatReport = (now: Date) => ({
    room: 'chat:0123456789abcdef01234567',
    queue: 'chat',
    reporter: 'R',
    target: 'T',
    guest: false,
    reason: 'chat',
    chatKind: 'contact',
    snapshot: {
        thread: 'dAAAAAAAAAAAAAAAAAAAAAA',
        kind: 'dm',
        from: 'T',
        k: 't',
        text: 'add me',
        at: now,
        context: [{ from: 'R', k: 'q', id: 0, at: now }],
    },
    status: 'open',
    createdAt: now,
    expireAt: new Date(now.getTime() + 180 * 86_400_000),
});

describe('chat reports for moderators', () => {
    it('contracts: chat is stored but never a PvP chip; chat_mute is a sanction', () => {
        expect(REPORT_REASONS).not.toContain('chat');
        expect(STORED_REPORT_REASONS).toContain('chat');
        expect(SANCTION_KINDS).toContain('chat_mute');
    });

    it('a PvP report with reason chat is refused', async () => {
        const { svc } = harness();
        await expect(svc.report({ id: 'R', guest: false }, { room: 'r1', slot: 1, reason: 'chat' })).rejects.toThrow();
    });

    it('list groups chat reports with F6; detail shows the snapshot and sub-reason', async () => {
        const { svc, reports, clock } = harness();
        await reports.create(chatReport(clock.now()));
        const list = await svc.list({ reason: 'chat' });
        expect(list.groups).toHaveLength(1);
        expect(list.groups[0].counts).toEqual({ chat: 1 });
        expect(list.groups[0].flags).toContain('F6');
        const detail = await svc.detail('T');
        expect(detail.reports[0]).toMatchObject({ reason: 'chat', chatKind: 'contact', snapshot: { text: 'add me' } });
        // a chat report names no match room
        expect(detail.rooms).toEqual([]);
        expect(JSON.stringify(detail)).not.toContain('"reporter"');
    });

    it('chat_mute: 7 days, or permanent without days', async () => {
        const { svc, reports, sanctions, clock } = harness();
        await reports.create(chatReport(clock.now()));
        const timed = await svc.resolve('T', 'M', { action: 'chat_mute', days: 7, reasonCode: 'contact' });
        expect(new Date(timed.sanction!.until!).getTime() - clock.ms).toBe(7 * 86_400_000);
        await reports.create({ ...chatReport(clock.now()), room: 'chat:0123456789abcdef01234568' });
        const forever = await svc.resolve('T', 'M', { action: 'chat_mute', reasonCode: 'harass' });
        expect(forever.sanction!.until).toBeNull();
        expect(sanctions.docs.map(s => s.kind)).toEqual(['chat_mute', 'chat_mute']);
        expect((await svc.active('T')).map(s => s.kind)).toContain('chat_mute');
    });
});
