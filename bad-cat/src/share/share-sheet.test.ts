// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHandoffLink, copyText, handoffSteps, inAppFromUa, needsHandoff } from './inapp-handoff';
import { clipFileName, shareClip } from './share-sheet';
import { fixtureRoom } from './test-fixtures';
import { DEFAULT_CAT } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('shareClip', () => {
  const clip = new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' });

  it('uses navigator.share with files when it can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    expect(await shareClip(clip, 'hi')).toBe('native_share');
    expect(share.mock.calls[0][0].files[0].name).toMatch(/^bad-cat-\d{8}\.mp4$/);
  });

  it('reports a dismissed sheet as cancelled', async () => {
    const err = Object.assign(new Error('x'), { name: 'AbortError' });
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(err), canShare: () => true });
    expect(await shareClip(clip, 'hi')).toBe('cancelled');
  });

  it('falls back to a download without file sharing', async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    expect(await shareClip(clip, 'hi')).toBe('download');
  });

  it('names webm clips .webm', () => {
    expect(clipFileName('video/webm', new Date(2026, 10, 16))).toBe('bad-cat-20261116.webm');
  });
});

describe('in-app handoff', () => {
  it('detects the in-app browsers', () => {
    expect(inAppFromUa('Mozilla/5.0 (iPhone) musical_ly_32.1')).toBe('tiktok');
    expect(inAppFromUa('Mozilla/5.0 Instagram 300.0')).toBe('instagram');
    expect(inAppFromUa('Mozilla/5.0 [FBAN/FBIOS;FBAV/400]')).toBe('facebook');
    expect(inAppFromUa('Mozilla/5.0 (iPhone) Safari/604.1')).toBe('none');
    expect(needsHandoff({ inApp: 'tiktok' })).toBe(true);
    expect(handoffSteps({ inApp: 'tiktok', isIOS: true }).title).toBe('Open in Safari to save your clip');
    expect(handoffSteps({ inApp: 'instagram', isIOS: false }).title).toBe('Open in Chrome to save your clip');
  });

  it('builds a handoff link for the room (codec or plain fallback)', () => {
    const link = buildHandoffLink(fixtureRoom(), DEFAULT_CAT, [], 'https://tokentails.com/badcat');
    expect(link).toContain('/d/18');
  });

  it('copies text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    expect(await copyText('https://x')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x');
  });
});
