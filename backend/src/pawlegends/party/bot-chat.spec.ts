import { readFileSync } from 'fs';
import { join } from 'path';
import { encodeTurnBody } from './net';
import { RefereeRoom, type RefereeConfig } from './referee-core';
import { BotChat, BotSeenStore, SeatLimiter, botChatSeed } from './bot-chat';
import { simFor } from '../../vendor/pawlegends-sim';
import { BOT_LINES } from '../../vendor/pawlegends-chat/botLines';
import { filterChatText } from '../../shared-contracts/chat-filter';

/*
 * The relay side of bot chatter (MATCH-CHAT.md §5): the referee reads cues without moving a hash (every v19+ party
 * fixture's config, cues on vs off), the seat limiter is a human socket's, a room's seed is salted, a silent room says
 * nothing, and each recipient's memory is written once per match (registered in Mongo, guests in memory).
 */

const FIXTURES = ['hearthwood-party', 'hearthwood-pvp', 'pvp-replay'];

function configOf(rec: any): RefereeConfig {
    return {
        seed: rec.seed,
        picks: rec.picks,
        tricks: rec.tricks,
        difficulty: rec.difficulty,
        humans: rec.humans.map((h: { slot: number }) => h.slot),
        ...(rec.mode === 'pvp' ? { mode: 'pvp' as const, fillDifficulty: rec.fillDifficulty } : {}),
        ...(rec.map ? { map: rec.map } : {}),
    };
}

describe('referee chat cues are read only (MATCH-CHAT.md §5.1)', () => {
    jest.setTimeout(240_000);

    for (const v of [19, 20, 21])
        for (const name of FIXTURES)
            it(`sim v${v} ${name}: the hash trail and the end are identical with cues read every tick`, () => {
                const sim = simFor(v)!.party!;
                const rec = JSON.parse(
                    readFileSync(join(__dirname, `../../vendor/pawlegends-sim/v${v}/${name}.fixture.json`), 'utf8')
                );
                const config = configOf(rec);
                const slots = config.map === 'hearthwood' ? 10 : 6;
                const bots = Array.from({ length: slots }, (_, i) => i).filter(i => !config.humans.includes(i));
                const plain = new RefereeRoom(sim, config, true, null);
                const chatty = new RefereeRoom(sim, config, true, { bots });
                // every human seat is flown by its pilot: real fights, deaths, towers
                const mask = config.humans.reduce((m, s) => m | (1 << s), 0);
                let cues = 0;
                let states = 0;
                // the first hero takedown or tower lands at about turn 1500 to 2250 (2 to 3 match minutes)
                for (let turn = 0; turn < 2700 && !plain.ended; turn++) {
                    const body = encodeTurnBody({ turn, modeMask: mask, acks: [], entries: [] });
                    const a = plain.applyTurn(body);
                    const b = chatty.applyTurn(body);
                    expect(b.hashes).toEqual(a.hashes);
                    expect(b.aliveMask).toBe(a.aliveMask);
                    expect(b.pilot.map(p => [p.slot, p.cmds.map(c => [...c])])).toEqual(
                        a.pilot.map(p => [p.slot, p.cmds.map(c => [...c])])
                    );
                    expect(a.cues).toBeUndefined();
                    cues += b.cues?.length ?? 0;
                    if (b.states) {
                        states++;
                        expect(b.states.map(s => s.slot).every(s => bots.includes(s))).toBe(true);
                    }
                }
                expect(chatty.sim.hash(chatty.m)).toBe(plain.sim.hash(plain.m));
                expect(chatty.ended?.finalHash).toBe(plain.ended?.finalHash);
                expect(cues).toBeGreaterThan(0);
                expect(states).toBeGreaterThan(10);
            });
});

describe('bot chat relay pieces', () => {
    jest.setTimeout(60_000);
    it('a bot seat has a human socket bucket: 5 in 10 s, the same text at most twice a minute', () => {
        const l = new SeatLimiter();
        for (let i = 0; i < 5; i++) expect(l.allow(i * 100, `line ${i}`)).toBe(true);
        expect(l.allow(600, 'six')).toBe(false);
        expect(l.allow(11_000, 'gg')).toBe(true);
        expect(l.allow(22_000, 'gg')).toBe(true);
        expect(l.allow(33_000, 'GG')).toBe(false);
        expect(l.allow(83_000, 'gg')).toBe(true);
    });

    it('the seed is salted per relay (never derivable from the room id) and stable for one salt', () => {
        expect(botChatSeed('room1', 'a')).toBe(botChatSeed('room1', 'a'));
        expect(botChatSeed('room1', 'a')).not.toBe(botChatSeed('room1', 'b'));
        expect(botChatSeed('room1', 'a')).not.toBe(botChatSeed('room2', 'a'));
    });

    it('a silent room (ranked, a first match) never sends a line; a chatty one sends bank lines that pass the filter', () => {
        const lids = new Set(BOT_LINES.map(l => l.lid));
        let sent = 0;
        for (let i = 0; i < 300; i++) {
            for (const silent of [true, false]) {
                const chat = new BotChat({
                    room: `r${i}`,
                    salt: 'spec',
                    slots: 6,
                    teamSize: 3,
                    humans: [0],
                    tiers: ['text', 'text'],
                    silent,
                    startMs: 0,
                });
                const out = [];
                for (let t = 0; t < 40_000; t += 250) out.push(...chat.due(t));
                chat.cues([{ k: 'firstBlood', killer: 0, victim: 3 }], undefined, 50_000);
                for (let t = 50_000; t < 70_000; t += 250) out.push(...chat.due(t));
                chat.end(0, 420_000);
                for (let t = 420_000; t < 440_000; t += 250) out.push(...chat.due(t));
                if (silent) expect(out).toEqual([]);
                for (const l of out) {
                    expect(lids.has(l.lid.replace(/\*$/, ''))).toBe(true);
                    if (l.k === 't') expect(filterChatText(l.text).ok).toBe(true);
                }
                if (!silent) sent += out.length;
            }
        }
        expect(sent).toBeGreaterThan(30);
    });

    it('memory: registered rings in pawlegendssocial.botSeen (one write each), guests in memory', async () => {
        const writes: any[] = [];
        const model = {
            find: () => ({
                select: () => ({ lean: async () => [{ _id: 'acct-a', botSeen: { l: ['st01'], s: ['gl hf'] } }] }),
            }),
            updateOne: async (f: any, u: any) => writes.push({ f, u }),
        };
        const store = new BotSeenStore(model);
        const got = await store.load(['a:acct-a', 'g:guest1']);
        expect(got.get('a:acct-a')).toEqual({ l: ['st01'], s: ['gl hf'] });
        expect(got.has('g:guest1')).toBe(false);
        await store.save('a:acct-a', got.get('a:acct-a')!, [
            { lid: 'pr03', surface: 'gj', tok: 'gj' },
            { lid: 'de07', surface: 'ouch' },
        ]);
        expect(writes).toHaveLength(1);
        expect(writes[0].f).toEqual({ _id: 'acct-a' });
        expect(writes[0].u.$set.botSeen).toEqual({
            l: ['st01', 'de07'],
            s: ['gl hf', 'gj', 'ouch'],
            t: { gj: ['gj'] },
        });
        await store.save('g:guest1', null, [{ lid: 'st02', surface: 'glhf' }]);
        expect(writes).toHaveLength(1);
        expect((await store.load(['g:guest1'])).get('g:guest1')).toEqual({ l: ['st02'], s: ['glhf'], t: {} });
        // nothing to remember: no write
        await store.save('a:acct-a', null, []);
        expect(writes).toHaveLength(1);
    });
});
