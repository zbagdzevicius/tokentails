import {
    accountChatTier,
    CHAT_LIMITS,
    CHAT_PHRASES,
    CHAT_STICKERS,
    crossesAdultLine,
    isAvatarView,
    phraseInScope,
    threadChatTier,
} from '../../shared-contracts/chat';
import { filterChatText, normalizeChatText } from '../../shared-contracts/chat-filter';
import { CHAT_PASS, CHAT_PROBES, CHAT_REJECT } from './chat-filter.corpus';

/*
 * The chat filter (CHAT-AVATARS.md §2.4) on its corpus: at least 150 lines that must pass and 150 that must be refused
 * with the right reason class (EN, LT, leet, spacing, spelled digits and emails, TLDs, addresses), the probes of a
 * 16-17 ↔ 18+ thread, NFKC and invisible characters, the Latin charset, and the tier rules.
 */

describe('chat filter corpus', () => {
    it('has at least 150 passing and 150 refused lines', () => {
        expect(CHAT_PASS.length).toBeGreaterThanOrEqual(150);
        expect(CHAT_REJECT.length).toBeGreaterThanOrEqual(150);
    });

    it.each(CHAT_PASS.map(t => [t]))('passes %j', text => {
        const r = filterChatText(text);
        expect(r).toEqual({ ok: true, text: normalizeChatText(text) });
    });

    it.each(CHAT_REJECT.map(([t, why]) => [t, why]))('refuses %j as %s', (text, why) => {
        expect(filterChatText(text)).toEqual({ ok: false, why });
    });

    it.each(CHAT_PROBES.map(t => [t]))('probe %j: refused only across the 18 line', text => {
        expect(filterChatText(text).ok).toBe(true);
        expect(filterChatText(text, { probes: true })).toEqual({ ok: false, why: 'contact' });
    });
});

describe('chat filter normalisation', () => {
    it('NFKC, one line, invisible and bidi characters removed, repeats cut to 3, trimmed', () => {
        expect(normalizeChatText('  ｇｇ\n\nwp  ')).toBe('gg wp');
        expect(normalizeChatText('n​i‮ce')).toBe('nice');
        expect(normalizeChatText('noooooooo!!!!!!')).toBe('nooo!!!');
        expect(normalizeChatText('‘hi’')).toBe("'hi'");
    });

    it('never throws and refuses non-strings', () => {
        for (const v of [undefined, null, 5, {}, [], 'x'.repeat(10_000)]) expect(() => filterChatText(v)).not.toThrow();
        expect(filterChatText(42)).toEqual({ ok: false, why: 'empty' });
    });

    it('emoji are allowed; images, files and scripts outside Latin are not', () => {
        expect(filterChatText('gg 🐾😹👑').ok).toBe(true);
        expect(filterChatText('labas ąčęėįšųūž').ok).toBe(true);
        expect(filterChatText('ПРИВЕТ')).toEqual({ ok: false, why: 'charset' });
    });
});

describe('chat contracts', () => {
    it('24 phrases and 8 stickers in wire id order', () => {
        expect(CHAT_PHRASES).toHaveLength(40);
        CHAT_PHRASES.forEach((p, i) => expect(p.id).toBe(i));
        expect(CHAT_STICKERS).toHaveLength(8);
        expect(phraseInScope(0, 'dm')).toBe(true);
        expect(phraseInScope(0, 'team')).toBe(false);
        expect(phraseInScope(12, 'dm')).toBe(false);
        expect(phraseInScope(12, 'team')).toBe(true);
        expect(phraseInScope(24, 'dm')).toBe(false);
    });

    it('tiers: 16+ registered is text; under 16, unknown and guests are quick; the strictest wins', () => {
        expect(accountChatTier('18+', true)).toBe('text');
        expect(accountChatTier('16-17', true)).toBe('text');
        expect(accountChatTier('under16', true)).toBe('quick');
        expect(accountChatTier(null, true)).toBe('quick');
        expect(accountChatTier('18+', false)).toBe('quick');
        expect(threadChatTier(['text', 'text'])).toBe('text');
        expect(threadChatTier(['text', 'quick'])).toBe('quick');
        expect(threadChatTier([])).toBe('quick');
        expect(crossesAdultLine(['16-17', '18+'])).toBe(true);
        expect(crossesAdultLine(['18+', '18+'])).toBe(false);
        expect(CHAT_LIMITS.textMax).toBe(120);
        expect(CHAT_LIMITS.retentionDays).toBe(30);
    });

    it('avatar views: only known shapes and bucket art', () => {
        expect(isAvatarView({ i: 'h:clem' })).toBe(true);
        expect(
            isAvatarView({
                i: 'c:0123456789abcdef01234567',
                img: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/cats/a.png',
            })
        ).toBe(true);
        expect(isAvatarView({ i: 'c:0123456789abcdef01234567', img: 'https://evil.example/a.png' })).toBe(false);
        expect(isAvatarView({ i: 'h:clem', f: 'frame.store.goldpaw', t: 'title.s1.rookie' })).toBe(true);
        expect(isAvatarView({ i: 'x:clem' })).toBe(false);
        expect(isAvatarView({ i: 'h:clem', f: 'javascript:alert(1)' })).toBe(false);
    });
});
