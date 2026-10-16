/**
 * Build config guards: the E2E and capture flags are always inlined (so builds without them compile
 * the hooks out, scripts/check-bundle-hooks.mjs), and the sitemap leaves out /yourcat while it is
 * paused (launch checklist: remove the exclusion when /yourcat launches).
 */
// Modules are re-required inside jest.isolateModules under a different env.
/* eslint-disable @typescript-eslint/no-require-imports */

const FLAGS = ["NEXT_PUBLIC_E2E", "NEXT_PUBLIC_CAPTURE"] as const;

const loadConfig = (env: Partial<Record<(typeof FLAGS)[number], string>>) => {
  const previous = Object.fromEntries(FLAGS.map((name) => [name, process.env[name]]));
  for (const name of FLAGS) {
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
  try {
    let loaded: { env?: Record<string, string> } | undefined;
    jest.isolateModules(() => {
      loaded = require("../next.config.js");
    });
    return loaded!;
  } finally {
    for (const name of FLAGS) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
};

describe("next.config.js env", () => {
  it("inlines the E2E and capture flags as empty strings when they are unset", () => {
    const config = loadConfig({});
    expect(config.env).toEqual(
      expect.objectContaining({ NEXT_PUBLIC_E2E: "", NEXT_PUBLIC_CAPTURE: "" }),
    );
  });

  it("keeps a flag a build sets", () => {
    const config = loadConfig({ NEXT_PUBLIC_E2E: "1", NEXT_PUBLIC_CAPTURE: "1" });
    expect(config.env?.NEXT_PUBLIC_E2E).toBe("1");
    expect(config.env?.NEXT_PUBLIC_CAPTURE).toBe("1");
  });
});

describe("next-sitemap.config.js", () => {
  it("leaves /yourcat out while it is paused, next to the existing exclusions", () => {
    const config = require("../next-sitemap.config.js");
    expect(config.exclude).toEqual(
      expect.arrayContaining(["/gaming", "/cats/view", "/feed/article", "/yourcat"]),
    );
  });
});
