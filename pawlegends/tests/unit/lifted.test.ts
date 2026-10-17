// @vitest-environment happy-dom
/**
 * Every lifted PPK module resolves and evaluates (named imports between lifted files, support files and stubs
 * line up). Runs in happy-dom because some PPK UI modules touch the DOM at load.
 */
import { describe, expect, it } from 'vitest';

const modules = import.meta.glob(['../../src/render/**/*.js', '../../src/input/**/*.js', '../../src/ui/**/*.js']);

describe('lifted PPK modules', () => {
  it('there are lifted modules', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(30);
  });
  for (const [file, load] of Object.entries(modules)) {
    it(`loads ${file.replace('../../', '')}`, async () => {
      await expect(load()).resolves.toBeDefined();
    });
  }
});
