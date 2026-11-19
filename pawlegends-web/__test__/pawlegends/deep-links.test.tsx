/**
 * @jest-environment jsdom
 */
/**
 * Party links open the app (docs/plans/moba/DEEP-LINKS.md): the association files published from app-links.json, the
 * IDs they carry against the native projects, and the `/p/<code>` page for phones without the app and desktops.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { partyCodeOfPath } from "@/components/pawlegends/flags";
import PartyInvitePage, { getServerSideProps, IOS_APP_ID, partyPlayHref } from "@/pages/p/[code]";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appLinks = require("../../lib/appLinks.js");

const ROOT = join(__dirname, "../..");
const cfg = JSON.parse(readFileSync(join(ROOT, "app-links.json"), "utf8"));

describe("app association files", () => {
  it("app-links.json is valid and the committed public/ files are exactly what it makes", () => {
    expect(appLinks.problems(cfg)).toEqual([]);
    for (const [rel, text] of Object.entries(appLinks.outputs(cfg) as Record<string, string | null>)) {
      const file = join(ROOT, "public", rel);
      if (text === null) expect(existsSync(file)).toBe(false);
      else expect(readFileSync(file, "utf8")).toBe(text);
    }
  });

  it("apple-app-site-association names this app (Team ID and bundle id from the Xcode project) for /p/*", () => {
    const pbx = readFileSync(join(ROOT, "../pawlegends-app/ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    expect(pbx).toContain(`DEVELOPMENT_TEAM = ${cfg.ios.teamId};`);
    expect(pbx).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${cfg.ios.bundleId};`);
    const aasa = JSON.parse(readFileSync(join(ROOT, "public/.well-known/apple-app-site-association"), "utf8"));
    expect(aasa.applinks.details[0].appIDs).toEqual(["BVLDTU9V83.com.tokentails.pawlegends"]);
    expect(aasa.applinks.details[0].components).toContainEqual(expect.objectContaining({ "/": "/p/*" }));
  });

  it("assetlinks.json names the Android package; no file while no fingerprint is known", () => {
    const gradle = readFileSync(join(ROOT, "../pawlegends-app/android/app/build.gradle"), "utf8");
    expect(gradle).toContain(`applicationId "${cfg.android.package}"`);
    const withPrint = { ...cfg, android: { ...cfg.android, sha256: [Array(32).fill("AB").join(":")] } };
    expect(appLinks.androidAssociation(withPrint)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "com.tokentails.pawlegends", sha256_cert_fingerprints: [Array(32).fill("AB").join(":")] },
      },
    ]);
    expect(appLinks.androidAssociation({ ...cfg, android: { ...cfg.android, sha256: [] } })).toBeNull();
  });

  it("refuses a placeholder, a SHA-1 or a lower-case fingerprint, and a wrong Team ID (the build fails, nothing wrong ships)", () => {
    const sha1 = Array(20).fill("AB").join(":");
    for (const f of ["PASTE_PLAY_APP_SIGNING_SHA256", sha1, Array(32).fill("ab").join(":"), ""]) {
      const bad = appLinks.problems({ ...cfg, android: { ...cfg.android, sha256: [f] } });
      expect(bad.join(" ")).toMatch(/not a SHA-256 fingerprint/);
    }
    expect(appLinks.problems({ ...cfg, ios: { ...cfg.ios, teamId: "TEAMID" } }).join(" ")).toMatch(/Team ID/);
  });

  it("npm run build checks them first", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toBe("node scripts/app-links.mjs --check");
  });
});

describe("/p/<code>", () => {
  const ssr = async (code: unknown) => {
    const headers: Record<string, string> = {};
    const out = (await getServerSideProps({ params: { code }, res: { setHeader: (k: string, v: string) => (headers[k] = v) } } as never)) as {
      props: { code: string | null };
    };
    return { props: out.props, headers };
  };

  it("reads the code from the path: any case, dashes and spaces ignored", async () => {
    expect((await ssr("k7q-x2m")).props.code).toBe("K7QX2M");
    expect((await ssr("K7Q X2M")).props.code).toBe("K7QX2M");
    for (const bad of ["K7QX0M", "K7QX2", "", "<script>", "x".repeat(100), undefined, ["K7QX2M"]]) expect((await ssr(bad)).props.code).toBeNull();
    expect((await ssr("K7QX2M")).headers["Cache-Control"]).toMatch(/s-maxage=/);
    expect(partyCodeOfPath(42)).toBeNull();
  });

  it("one tap joins in the web game; the stores are offered", () => {
    render(<PartyInvitePage code="K7QX2M" />);
    expect(screen.getByTestId("party-invite-code").textContent).toBe("K7Q X2M");
    expect(screen.getByTestId("party-invite-join").getAttribute("href")).toBe("/play?party=K7QX2M");
    expect(partyPlayHref("ABCDEF")).toBe("/play?party=ABCDEF");
    const stores = screen.getByTestId("party-invite-stores");
    expect(stores.innerHTML).toContain("apps.apple.com/app/id6832032981");
    expect(stores.innerHTML).toContain("play.google.com/store/apps/details?id=com.tokentails.pawlegends");
    expect(IOS_APP_ID).toBe("6832032981");
  });

  it("a broken code says so and offers the player's own party", () => {
    render(<PartyInvitePage code={null} />);
    expect(screen.getByTestId("party-invite-bad").textContent).toMatch(/broken/);
    expect(screen.getByTestId("party-invite-own").getAttribute("href")).toBe("/play");
  });
});
