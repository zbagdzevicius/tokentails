/** Tiny argv helpers for the tools (no dependency). */
export function argValue(name, argv = process.argv.slice(2)) {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}
export const hasFlag = (name, argv = process.argv.slice(2)) => argv.includes(name);
/** Positional arguments (anything not a flag or a flag's value). `valued` lists flags that take a value. */
export function positionals(valued = [], argv = process.argv.slice(2)) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (valued.includes(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}
