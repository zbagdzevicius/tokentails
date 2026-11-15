import { afterEach, describe, expect, it } from 'vitest';
import { failedChunkUrl, isChunkLoadError, retryImport, retryUrl, setChunkRetryEnv, type ChunkRetryEnv } from '../../src/app/chunkRetry';
import { wrapDynamicImports } from '../../tools/lib/chunk-retry.mjs';

/** gaps5 polish 1: a failed lazy chunk is retried once (cache-busted) before the crash card. */
const CHROME = 'Failed to fetch dynamically imported module: https://pawlegends.app/pawlegends-game/build/slotTip-DBApZm_J.js';
const FIREFOX = 'error loading dynamically imported module: https://pawlegends.app/pawlegends-game/build/strip-Ab12.js';
const SAFARI = 'Importing a module script failed.';

let prev: ChunkRetryEnv | null = null;
afterEach(() => {
  if (prev) setChunkRetryEnv(prev);
  prev = null;
});

function env(over: Partial<ChunkRetryEnv> = {}) {
  const log: string[] = [];
  prev = setChunkRetryEnv({
    wait: async (ms) => void log.push(`wait:${ms}`),
    importUrl: async (url) => {
      log.push(`import:${url}`);
      return { ok: url };
    },
    onRetry: (ok) => void log.push(`retry:${ok}`),
    ...over,
  });
  return log;
}

describe('chunk retry', () => {
  it('reads the chunk URL of Chrome and Firefox load errors, and none from Safari', () => {
    expect(failedChunkUrl(new TypeError(CHROME))).toBe('https://pawlegends.app/pawlegends-game/build/slotTip-DBApZm_J.js');
    expect(failedChunkUrl(new TypeError(FIREFOX))).toBe('https://pawlegends.app/pawlegends-game/build/strip-Ab12.js');
    expect(failedChunkUrl(new TypeError(SAFARI))).toBeNull();
    expect(isChunkLoadError(new TypeError(CHROME))).toBe(true);
    expect(isChunkLoadError(new TypeError(SAFARI))).toBe(true);
    expect(isChunkLoadError(new Error('x is not a function'))).toBe(false);
  });

  it('adds the page token as a query (or to an existing one)', () => {
    expect(retryUrl('https://a.b/build/x.js', 'tok')).toBe('https://a.b/build/x.js?retry=tok');
    expect(retryUrl('https://a.b/build/x.js?v=1', 'tok')).toBe('https://a.b/build/x.js?v=1&retry=tok');
  });

  it('retries a named chunk once with a cache-busted URL', async () => {
    const log = env();
    let calls = 0;
    const out = await retryImport(async () => {
      calls++;
      throw new TypeError(CHROME);
    });
    expect(calls).toBe(1);
    expect(log[0]).toBe('wait:900');
    expect(log[1]).toMatch(/^import:https:\/\/pawlegends\.app\/pawlegends-game\/build\/slotTip-DBApZm_J\.js\?retry=[a-z0-9]+$/);
    expect(log[2]).toBe('retry:true');
    expect(out).toEqual({ ok: log[1].slice('import:'.length) });
  });

  it('calls the loader again when the error names no URL (Safari)', async () => {
    const log = env();
    let calls = 0;
    const out = await retryImport(async () => {
      calls++;
      if (calls === 1) throw new TypeError(SAFARI);
      return 'loaded';
    });
    expect(out).toBe('loaded');
    expect(calls).toBe(2);
    expect(log).toEqual(['wait:900', 'retry:true']);
  });

  it('retries only once, then the error reaches the crash card', async () => {
    const log = env({
      importUrl: async () => {
        throw new TypeError(CHROME);
      },
    });
    await expect(retryImport(() => Promise.reject(new TypeError(CHROME)))).rejects.toThrow(/dynamically imported module/);
    expect(log).toEqual(['wait:900', 'retry:false']);
  });

  it('never retries an error thrown by the chunk code itself', async () => {
    const log = env();
    await expect(retryImport(() => Promise.reject(new Error('boom in module')))).rejects.toThrow('boom in module');
    expect(log).toEqual([]);
  });
});

describe('chunk retry build transform', () => {
  it('wraps literal dynamic imports and keeps the literal for the bundler', () => {
    const src = "const a = () => import('./x');\nvoid import(\"../y/z\").then(f);\nimport.meta.url;\nobj.import('nope');";
    const out = wrapDynamicImports(src, '/src/app/chunkRetry.ts') as string;
    expect(out.startsWith('import { retryImport as __plRetry } from "/src/app/chunkRetry.ts";\n')).toBe(true);
    expect(out).toContain("__plRetry(() => import('./x'))");
    expect(out).toContain('__plRetry(() => import("../y/z")).then(f)');
    expect(out).toContain("obj.import('nope')");
    expect(out).toContain('import.meta.url');
  });

  it('leaves a module without dynamic imports alone', () => {
    expect(wrapDynamicImports("import { a } from './a';\nexport const b = a;", '/h.ts')).toBeNull();
    expect(wrapDynamicImports('const u = import(/* @vite-ignore */ url);', '/h.ts')).toBeNull();
  });
});
