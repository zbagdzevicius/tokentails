/**
 * Pure helpers for the per-day and per-shell HTML pages (GDD 6.6, 7.4): every page is the built index.html
 * with its own <title>, description, Open Graph and Twitter tags. Escaped, idempotent (the tag block is
 * marked and replaced on a re-run), no DOM.
 */

export const SITE_NAME = 'Bad Cat Daily';
export const OG_W = 1200;
export const OG_H = 630;
export const DEFAULT_PUBLIC_URL = 'https://tokentails.com';
const START = '<!-- badcat:og -->';
const END = '<!-- /badcat:og -->';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Origin without a trailing slash; anything that is not http(s) falls back to the default. */
export function publicOrigin(raw) {
  const v = String(raw ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/"'<>]+(\/[^\s"'<>]*)?$/i.test(v) ? v : DEFAULT_PUBLIC_URL;
}

/** Join an origin (or URL prefix) and a path with exactly one slash. */
export function joinUrl(base, p) {
  return `${String(base).replace(/\/+$/, '')}/${String(p).replace(/^\/+/, '')}`;
}

/**
 * The OG title of a daily (GDD 7.4): "Kitchen #18 · Breakfast Heist · can your cat wreck it?". Boss days have no
 * separate name ("Boss: Wedding Cake #13 · can your cat wreck it?").
 */
export function dayOgTitle(entry) {
  const label = String(entry.label ?? '').trim();
  const title = String(entry.title ?? label).trim();
  const name = label && title.startsWith(`${label}: `) ? title.slice(label.length + 2).trim() : '';
  const head = name ? `${label} · ${name}` : title || label || SITE_NAME;
  return `${head} · can your cat wreck it?`;
}

/** One line under the title: who is home, the twist, the hook. */
export function dayOgDescription(entry) {
  const parts = [];
  if (entry.human) parts.push(`${entry.human} is home.`);
  if (entry.twist) parts.push(`${String(entry.twist).replace(/[.!?]?$/, '.')}`);
  parts.push('Knock things off before the human turns around. A new room every day, free, no download.');
  return parts.join(' ');
}

/** The tag block for one page. `meta`: { title, description, url, image, imageAlt?, noindex? }. */
export function metaBlock(meta) {
  const e = escapeHtml;
  const lines = [
    `<title>${e(meta.title)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    ...(meta.noindex ? ['<meta name="robots" content="noindex" />'] : []),
    `<link rel="canonical" href="${e(meta.url)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${e(SITE_NAME)}" />`,
    `<meta property="og:title" content="${e(meta.title)}" />`,
    `<meta property="og:description" content="${e(meta.description)}" />`,
    `<meta property="og:url" content="${e(meta.url)}" />`,
    `<meta property="og:image" content="${e(meta.image)}" />`,
    `<meta property="og:image:width" content="${OG_W}" />`,
    `<meta property="og:image:height" content="${OG_H}" />`,
    `<meta property="og:image:alt" content="${e(meta.imageAlt ?? meta.title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${e(meta.title)}" />`,
    `<meta name="twitter:description" content="${e(meta.description)}" />`,
    `<meta name="twitter:image" content="${e(meta.image)}" />`,
  ];
  return `${START}\n    ${lines.join('\n    ')}\n    ${END}`;
}

/** Remove a previous block and any title / description / canonical / robots / og / twitter tags of the template. */
export function stripMeta(html) {
  let out = String(html);
  const s = out.indexOf(START);
  const t = out.indexOf(END);
  if (s >= 0 && t > s) out = out.slice(0, s) + out.slice(t + END.length);
  out = out
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["'](description|robots)["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  // Drop the blank lines the removed tags leave behind.
  return out.replace(/\n[ \t]*(?=\n)/g, '');
}

/**
 * A page from the built index.html: tags replaced, and for a page `depth` folders below the build root
 * (d/<n>.html: 1) relative asset URLs ("./build/...") move up so they still resolve. Absolute bases
 * (/badcat-game/) are untouched. Idempotent for depth 0; deeper pages are always made from the template.
 */
export function pageHtml(template, meta, depth = 0) {
  let html = stripMeta(template);
  if (!/<\/head>/i.test(html)) throw new Error('template has no </head>');
  html = html.replace(/[ \t]*<\/head>/i, `    ${metaBlock(meta)}\n  </head>`);
  if (depth > 0) {
    const up = '../'.repeat(depth);
    html = html.replace(/(\s(?:src|href)=["'])\.\//g, `$1${up}`);
  }
  return html;
}

/**
 * The static link-shell pages (GDD 6.6 link table): file name, title, description, OG image (relative to the
 * build's og/ folder), canonical path under /badcat, noindex for private return pages.
 */
export const STATIC_PAGES = Object.freeze([
  { file: 'r.html', path: 'r', image: 'r.png', title: 'A player-made room · can your cat wreck it?', description: 'Someone built this room for your cat. Wreck it before the human turns around.' },
  { file: 'c.html', path: 'c', image: 'c.png', title: 'Play as a cat like this one · Bad Cat Daily', description: 'Make your own cat from one photo and knock things off the counter. Free, no download.' },
  { file: 'pick.html', path: 'pick', image: 'pick.png', title: 'Which room did you see? · Bad Cat Daily', description: 'Pick the room from the clip: The Glass, today, or one of the last 14 days.' },
  { file: 'glass.html', path: 'glass', image: 'glass.png', title: 'The Glass · can your cat knock it off?', description: 'One wine glass, one counter edge, one human who is about to turn around.' },
  { file: 'maker.html', path: 'maker', image: 'r.png', title: 'Room Maker · Bad Cat Daily', description: 'Build a room, hide the breakables, dare a friend’s cat to wreck it.' },
  { file: 'thanks.html', path: 'thanks', image: 'pick.png', title: 'Thank you · Bad Cat Daily', description: 'Thanks for backing Bad Cat Daily.', noindex: true },
  { file: 'redeem.html', path: 'redeem', image: 'pick.png', title: 'Redeem a gift · Bad Cat Daily', description: 'Someone sent your cat a gift.', noindex: true },
  { file: 'restore.html', path: 'restore', image: 'pick.png', title: 'Restore purchases · Bad Cat Daily', description: 'Get your Club and cameos back on this device.', noindex: true },
]);

export const INDEX_META = Object.freeze({
  title: 'Bad Cat Daily · be the cat',
  description: 'Be the cat. Knock things off the counter before the human turns around. A new room every day, free, no download.',
  image: 'glass.png',
});
