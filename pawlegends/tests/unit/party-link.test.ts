import { describe, expect, it } from 'vitest';
import { inviteUrl, partyApi, partyFromUrl } from '../../src/share/partyLink';
import { displayCode, normalizeCode } from '../../src/net/proto';
import { qrMatrix, qrSvg } from '../../src/party/qr';

/* Party play P5 (MULTIPLAYER.md §5.3): links, codes and the QR. */

describe('party links (P5)', () => {
  it('reads ?party= case-folded; anything off the alphabet is ignored', () => {
    expect(partyFromUrl('?party=K7QX2M')).toBe('K7QX2M');
    expect(partyFromUrl('?party=k7qx2m')).toBe('K7QX2M');
    expect(partyFromUrl('?embed=1&party=k7q-x2m')).toBe('K7QX2M');
    for (const bad of ['?party=K7QX2', '?party=K7QX2MM', '?party=K7QX0M', '?party=K7QXIM', '?party=<script>', '?dare=1', '', '?party='])
      expect(partyFromUrl(bad)).toBeNull();
  });

  it('codes display as K7Q X2M and normalize back', () => {
    expect(displayCode('K7QX2M')).toBe('K7Q X2M');
    expect(normalizeCode('k7q x2m')).toBe('K7QX2M');
    expect(normalizeCode('K7QX2')).toBeNull();
  });

  it('the invite URL is the embed URL on tokentails.com from every surface (D12)', () => {
    expect(inviteUrl('K7QX2M')).toBe('https://tokentails.com/pawlegends?party=K7QX2M');
    // the same whatever page the game runs on (standalone, embed, app): no location is read
    for (const host of ['localhost:5176', 'tokentails.com', 'capacitor://localhost']) {
      void host;
      expect(inviteUrl('ABCDEF')).toBe('https://tokentails.com/pawlegends?party=ABCDEF');
    }
  });

  it('the relay origin is never taken from the page URL', () => {
    expect(partyApi('', 'tokentails.com')).toBe('https://api.tokentails.com');
    expect(partyApi('', 'evil.example')).toBeNull();
    expect(partyApi('http://evil.example', 'x')).toBeNull();
    expect(partyApi('http://localhost:3105', 'x')).toBe('http://localhost:3105');
  });

  it('the QR encodes the invite link and renders one escaped SVG', () => {
    const url = inviteUrl('K7QX2M');
    const m = qrMatrix(url);
    expect(m.size).toBeGreaterThanOrEqual(25);
    const svg = qrSvg(url, 'Scan to join');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('aria-label="Scan to join"');
    expect(svg).not.toContain(url); // the link is in the modules, never as markup
    expect(qrSvg(url, '"><script>')).not.toContain('<script>');
  });
});
