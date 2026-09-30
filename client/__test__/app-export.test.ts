/**
 * App builds (NEXT_PUBLIC_IS_APP) ship a static export for Capacitor: no
 * ISR, no server redirects, and links to client routes instead of dynamic
 * pages. Web builds keep ISR and the redirects.
 */
// Modules are re-required inside jest.isolateModules under a different env.
/* eslint-disable @typescript-eslint/no-require-imports */

const loadWithAppFlag = <T>(flag: string | undefined, load: () => T): T => {
  const previous = process.env.NEXT_PUBLIC_IS_APP;
  if (flag === undefined) {
    delete process.env.NEXT_PUBLIC_IS_APP;
  } else {
    process.env.NEXT_PUBLIC_IS_APP = flag;
  }
  try {
    let loaded: T | undefined;
    jest.isolateModules(() => {
      loaded = load();
    });
    return loaded as T;
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_IS_APP;
    } else {
      process.env.NEXT_PUBLIC_IS_APP = previous;
    }
  }
};

describe("next.config.js", () => {
  it("exports statically without redirects in app builds", () => {
    const config = loadWithAppFlag("true", () => require("../next.config.js"));
    expect(config.output).toBe("export");
    expect(config.redirects).toBeUndefined();
  });

  it("keeps the Node server and redirects on the web", () => {
    const config = loadWithAppFlag(undefined, () =>
      require("../next.config.js"),
    );
    expect(config.output).toBeUndefined();
    expect(typeof config.redirects).toBe("function");
  });
});

describe("static props", () => {
  it("drops ISR and fallback in app builds", async () => {
    const { getAppStaticProps, getAppStaticPaths } = loadWithAppFlag(
      "true",
      () => require("@/constants/props-functions"),
    );
    await expect(getAppStaticProps(() => ({ a: 1 }))).resolves.toEqual({
      props: { a: 1 },
    });
    await expect(getAppStaticPaths()).resolves.toEqual({
      paths: [],
      fallback: false,
    });
  });

  it("revalidates hourly and renders on demand on the web", async () => {
    const { getAppStaticProps, getAppStaticPaths } = loadWithAppFlag(
      undefined,
      () => require("@/constants/props-functions"),
    );
    await expect(getAppStaticProps()).resolves.toEqual({
      props: {},
      revalidate: 3600,
    });
    await expect(getAppStaticPaths()).resolves.toEqual({
      paths: [],
      fallback: "blocking",
    });
  });
});

describe("routing helpers", () => {
  it("links to client routes in app builds", () => {
    const { catPath, articlePath, webPath } = loadWithAppFlag("true", () =>
      require("@/api/routing"),
    );
    expect(catPath("abc")).toBe("/cats/view?id=abc");
    expect(articlePath("cats-nft", "my post")).toBe(
      "/feed/article?category=cats-nft&slug=my%20post",
    );
    expect(webPath(catPath("abc"))).toBe("/cats/abc");
    expect(webPath(articlePath("cats-nft", "hello"))).toBe(
      "/feed/cats-nft/hello",
    );
  });

  it("keeps the prerendered paths on the web", () => {
    const { catPath, articlePath, webPath } = loadWithAppFlag(undefined, () =>
      require("@/api/routing"),
    );
    expect(catPath("abc")).toBe("/cats/abc");
    expect(articlePath("cats-nft", "hello")).toBe("/feed/cats-nft/hello");
    expect(webPath("/feed/cats-nft/hello")).toBe("/feed/cats-nft/hello");
  });
});
