/**
 * Deploy skew for the embed build (`npm run build:client`, launch finding R2). Every build writes new hashed files to
 * `build/`. A tab opened before a redeploy still asks for the previous release's hashed chunks (the sim Worker on its
 * next match, lazy chunks), so the previous KEEP_RELEASES - 1 releases stay on disk next to the new one and only older
 * files are pruned. `build-releases.json` (outside `build/`, so it is not served as immutable) lists each kept
 * release's `build/` files, newest first. Outside `build/`, files that are neither in the bundle nor in the public dir
 * are removed, which is what `--emptyOutDir` did before.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Releases kept on disk: the current one plus the two before it. */
export const KEEP_RELEASES = 3;
export const MANIFEST = 'build-releases.json';
export const BUILD_DIR = 'build';

const sameSet = (a, b) => a.length === b.length && a.every((f) => b.includes(f));

/**
 * Pure plan. `previous` is the manifest's release list (newest first) or null when there is none yet; `existing` is
 * every file now in `build/` (dir-relative). Without a manifest the files already on disk that the new build did not
 * write count as one earlier release, so the first run keeps what is deployed today.
 */
export function planReleases(previous, current, existing, keep = KEEP_RELEASES) {
  const cur = [...new Set(current)].sort();
  let older = Array.isArray(previous) ? previous.map((r) => [...r].sort()) : [];
  if (!Array.isArray(previous)) {
    const legacy = existing.filter((f) => !cur.includes(f)).sort();
    if (legacy.length) older = [legacy];
  }
  if (older.length && sameSet(older[0], cur)) older = older.slice(1); // a rebuild of the same sources
  const releases = [cur, ...older].slice(0, Math.max(1, keep));
  const kept = new Set(releases.flat());
  const remove = existing.filter((f) => !kept.has(f)).sort();
  return { releases, remove };
}

const walk = (dir, rel = '') =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(path.join(dir, d.name), `${rel}${d.name}/`) : [`${rel}${d.name}`],
      )
    : [];

/**
 * After the bundle is written: update the manifest and prune. `bundleFiles` are the outDir-relative names Vite wrote;
 * `publicDir` is the copied public folder (its files are kept outside `build/`).
 */
export function recordRelease(outDir, bundleFiles, publicDir, keep = KEEP_RELEASES) {
  const prefix = `${BUILD_DIR}/`;
  const current = bundleFiles.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length));
  const manifestPath = path.join(outDir, MANIFEST);
  let previous = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (Array.isArray(parsed?.releases)) previous = parsed.releases.filter(Array.isArray);
  } catch {
    previous = null;
  }
  const { releases, remove } = planReleases(previous, current, walk(path.join(outDir, BUILD_DIR)), keep);
  for (const f of remove) fs.rmSync(path.join(outDir, BUILD_DIR, f), { force: true });

  const keepOutside = new Set([MANIFEST, ...bundleFiles.filter((f) => !f.startsWith(prefix)), ...(publicDir ? walk(publicDir) : [])]);
  const staleOutside = walk(outDir).filter((f) => !f.startsWith(prefix) && !keepOutside.has(f));
  for (const f of staleOutside) fs.rmSync(path.join(outDir, f), { force: true });

  fs.writeFileSync(manifestPath, `${JSON.stringify({ keep, releases }, null, 2)}\n`);
  return { releases, removed: [...remove.map((f) => prefix + f), ...staleOutside] };
}
