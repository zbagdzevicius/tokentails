import { describe, expect, it } from 'vitest';
import * as shared from '../../../shared/chat';
import { AVATAR_IMG_RE, AVATAR_ICON_RE, CHAT_LIMITS_CLIENT, CHAT_PHRASES, CHAT_REPORT_KINDS, CHAT_STICKERS, MATCH_LEGACY_CHAT, SIDE_FACE, SIDE_FACE_PHRASE, chatBodyText, chatErrorText, isAvatarView, matchPhraseText, phrasesFor, previewText } from '../../src/data/chatPhrases';
import { CHAT_LINES } from '../../src/data/social';

/** The game's chat vocabulary mirrors shared/chat.ts (CHAT-AVATARS.md §2.3). */
describe('chat phrases mirror shared/chat.ts', () => {
  it('phrases, stickers, report kinds and avatar rules deep-equal', () => {
    expect(CHAT_PHRASES.map((p) => ({ ...p, scopes: [...p.scopes] }))).toEqual(shared.CHAT_PHRASES.map((p) => ({ ...p, scopes: [...p.scopes] })));
    expect([...CHAT_STICKERS]).toEqual([...shared.CHAT_STICKERS]);
    expect([...CHAT_REPORT_KINDS]).toEqual([...shared.CHAT_REPORT_KINDS]);
    expect(AVATAR_IMG_RE.source).toBe(shared.AVATAR_IMG_RE.source);
    expect(AVATAR_ICON_RE.source).toBe(shared.AVATAR_ICON_RE.source);
    expect(CHAT_LIMITS_CLIENT.textMax).toBe(shared.CHAT_LIMITS.textMax);
    expect(CHAT_LIMITS_CLIENT.pollMs).toBe(shared.CHAT_LIMITS.pollMs);
    expect(CHAT_LIMITS_CLIENT.historyPage).toBe(shared.CHAT_LIMITS.historyPage);
    expect(CHAT_LIMITS_CLIENT.rawMax).toBe(shared.CHAT_LIMITS.rawMax);
    expect({ ...MATCH_LEGACY_CHAT }).toEqual({ ...shared.MATCH_LEGACY_CHAT });
    expect(SIDE_FACE_PHRASE).toBe(shared.SIDE_FACE_PHRASE);
    expect({ ...SIDE_FACE }).toEqual({ ...shared.SIDE_FACE });
  });

  it('in-match phrases (MATCH-CHAT.md §2.1): ids 24–39, all-chat ones a subset, legacy ids mean the same', () => {
    const match = phrasesFor('match').map((p) => p.id);
    expect(match).toEqual(Array.from({ length: 16 }, (_, i) => 24 + i));
    expect(phrasesFor('all').every((p) => p.scopes.includes('match'))).toBe(true);
    expect(phrasesFor('all').map((p) => p.id)).not.toContain(29);
    // the legacy wheel line of each mapped phrase says the same thing
    expect(Object.entries(MATCH_LEGACY_CHAT).map(([id, legacy]) => [chatBodyText('q', Number(id)), CHAT_LINES[legacy]])).toEqual([
      ['gg', 'GG'],
      ['Nice!', 'Nice!'],
      ['Thanks!', 'Thanks'],
      ['On my way', 'On my way'],
      ['Group up', 'Group up'],
    ]);
    expect(matchPhraseText(38, 'dog')).toBe('🐶');
    expect(matchPhraseText(38, 'cat')).toBe('😼');
    expect(matchPhraseText(24)).toBe('gl hf');
  });

  it('scopes, previews and the avatar check', () => {
    expect(phrasesFor('team').every((p) => p.scopes.includes('team'))).toBe(true);
    expect(phrasesFor('dm').map((p) => p.id)).toContain(0);
    expect(chatBodyText('q', 5)).toBe('GG, well played!');
    expect(chatBodyText('s', 0)).toBe('🐾');
    expect(chatBodyText('q', 99)).toBe('');
    expect(previewText('[q:12]')).toBe('Ready!');
    expect(previewText('hello')).toBe('hello');
    for (const v of [{ i: 'h:clem' }, { i: 'c:0123456789abcdef01234567', img: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png' }])
      expect(isAvatarView(v)).toBe(shared.isAvatarView(v));
    expect(isAvatarView({ i: 'c:0123456789abcdef01234567', img: 'https://evil.example/a.png' })).toBe(false);
  });

  it('errors never echo text', () => {
    expect(chatErrorText('PAWLEGENDS_CHAT_REJECTED', 'link')).toMatch(/no links/);
    expect(chatErrorText('PAWLEGENDS_CHAT_RATE')).toBe('Slow down a little');
    expect(chatErrorText('weird')).toBe("Couldn't send. Try again");
  });
});
