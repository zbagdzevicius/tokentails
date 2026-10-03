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

describe("web redirects", () => {
  const webRedirects = async () => {
    const config = loadWithAppFlag(undefined, () =>
      require("../next.config.js"),
    );
    return (await config.redirects()) as {
      source: string;
      destination: string;
      permanent: boolean;
    }[];
  };

  it("retires /old-landing to the landing (decision #43)", async () => {
    expect(await webRedirects()).toContainEqual({
      source: "/old-landing",
      destination: "/",
      permanent: true,
    });
  });

  it("serves /heist from the host page and moves the old static paths permanently", async () => {
    const redirects = await webRedirects();
    const find = (source: string) =>
      redirects.find((redirect) => redirect.source === source);
    // pages/heist.tsx answers /heist itself (plan G2 layer 1): no redirect may shadow it.
    expect(find("/heist")).toBeUndefined();
    expect(redirects.some((redirect) => redirect.source === "/heist" || redirect.source === "/heist/")).toBe(false);
    expect(find("/heist/index.html")).toEqual({
      source: "/heist/index.html",
      destination: "/heist",
      permanent: true,
    });
    expect(find("/heist/:path+")).toEqual({
      source: "/heist/:path+",
      destination: "/heist-game/:path+",
      permanent: true,
    });
    // The exact rule comes before the catch-all, which would otherwise match it.
    const catchAll = redirects.indexOf(find("/heist/:path+")!);
    expect(redirects.indexOf(find("/heist/index.html")!)).toBeLessThan(catchAll);
  });
});

describe("Catnip Heist build in public/", () => {
  const { existsSync, readFileSync, readdirSync } = require("node:fs");
  const { join } = require("node:path");
  const publicDir = join(__dirname, "..", "public");

  it("is built for /heist-game/", () => {
    const html = readFileSync(join(publicDir, "heist-game", "index.html"), "utf8");
    expect(html).toMatch(/src="\/heist-game\/build\/index-[\w-]+\.js"/);
    expect(html).not.toMatch(/="\/heist\//);
  });

  it("keeps only a forwarder to the host page at the old /heist path", () => {
    expect(readdirSync(join(publicDir, "heist"))).toEqual(["index.html"]);
    const stub = readFileSync(join(publicDir, "heist", "index.html"), "utf8");
    expect(stub).toContain('location.replace("/heist" + location.search');
    expect(stub).toContain('content="noindex"');
    expect(existsSync(join(publicDir, "heist", "build"))).toBe(false);
  });
});

describe("check-app-export.mjs", () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
  const { dirname, join } = require("node:path");
  const { tmpdir } = require("node:os");
  const { spawnSync } = require("node:child_process");
  const script = join(__dirname, "..", "scripts", "check-app-export.mjs");
  const routes = [
    "index.html",
    "404.html",
    "game.html",
    "cats.html",
    "cats/view.html",
    "feed.html",
    "feed/article.html",
    "packs.html",
    "box.html",
  ];
  const HOST = '<iframe title="Catnip Heist" src="/heist-game/index.html?embed=1"></iframe>';
  const FORWARDER = '<script>location.replace("/heist" + location.search + location.hash);</script>';
  let dir: string;

  const write = (file: string, content = '<script src="/_next/static/x.js"></script>') => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  };
  const run = () =>
    spawnSync(process.execPath, [script, dir], { encoding: "utf8" });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "app-export-"));
    routes.forEach((file) => write(file));
    write("heist.html", HOST);
    write("heist/index.html", FORWARDER);
    write("impact.html");
    write("impact/snapshot.json", JSON.stringify({ _v: 1, money: { bySymbol: {} } }));
    write("facts/facts.json", JSON.stringify({ version: 1, facts: [{ id: "F-011" }] }));
    mkdirSync(join(dir, "_next", "static"), { recursive: true });
  });

  it("fails without the bundled impact baseline or the facts registry (task 7b)", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    rmSync(join(dir, "impact", "snapshot.json"));
    rmSync(join(dir, "facts", "facts.json"));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("impact/snapshot.json");
    expect(result.stderr).toContain("facts/facts.json");
  });

  it("fails when the impact baseline is not a v1 snapshot", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    write("impact/snapshot.json", JSON.stringify({ _v: 2 }));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not a v1 impact snapshot");
  });

  it("fails when the facts registry has no public facts", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    write("facts/facts.json", JSON.stringify({ version: 1, facts: [] }));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no public facts");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes with every route and the Heist built for /heist-game/", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("fails without heist-game/index.html", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("heist-game/index.html");
  });

  it("fails without the heist.html host page", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    rmSync(join(dir, "heist.html"));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("heist.html");
  });

  it("fails when heist.html does not embed the build in its static HTML", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    write("heist.html", '<div id="__next"></div>');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("embed /heist-game/index.html?embed=1");
  });

  it("fails when the old path still forwards straight into the build", () => {
    write("heist-game/index.html", '<script src="/heist-game/build/index-a1.js"></script>');
    write("heist/index.html", '<script>location.replace("/heist-game/index.html");</script>');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("forward to /heist");
  });

  it("fails when the Heist was built for another base", () => {
    write("heist-game/index.html", '<script src="/heist/build/index-a1.js"></script>');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/heist-game/build/");
  });
});
