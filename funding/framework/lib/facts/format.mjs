// Canonical facts.json formatting: two-space JSON, with short arrays and flat objects kept on one
// line (["landing"], { "endpoint": "/impact", "path": "players" }) so the registry stays readable
// and `fund facts absorb` rewrites it without noise.

const INLINE_MAX = 100;

function isFlat(value) {
  if (Array.isArray(value)) return value.every((v) => v === null || typeof v !== 'object');
  if (value && typeof value === 'object') return Object.values(value).every((v) => v === null || typeof v !== 'object');
  return true;
}

function inline(value) {
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  const parts = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}

function fmt(value, depth) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (depth > 1 && isFlat(value)) {
    const one = inline(value);
    if (one.length + pad.length <= INLINE_MAX) return one;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => pad + fmt(v, depth + 1)).join(',\n')}\n${end}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${fmt(v, depth + 1)}`).join(',\n')}\n${end}}`;
}

export function formatRegistry(registry) {
  return `${fmt(registry, 0)}\n`;
}
