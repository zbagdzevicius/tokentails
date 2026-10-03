import fs from "fs";
import path from "path";
import config, { NATIVE_BACKGROUND } from "../capacitor.config";
import { applyNativeChrome } from "@/components/native/statusBar";
import { THEME_COLOR } from "@/design/tokens";

const CLIENT = path.resolve(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(CLIENT, f), "utf8");

describe("native chrome (plan G6)", () => {
  it("Capacitor paints night-900 behind the web view and adjusts edge-to-edge margins", () => {
    expect(NATIVE_BACKGROUND).toBe(THEME_COLOR);
    expect(config.backgroundColor).toBe(THEME_COLOR);
    expect(config.ios?.backgroundColor).toBe(THEME_COLOR);
    expect(config.android?.backgroundColor).toBe(THEME_COLOR);
    expect(config.android?.adjustMarginsForEdgeToEdge).toBe("auto");
    expect(config.plugins?.StatusBar).toEqual({ style: "DARK", backgroundColor: THEME_COLOR });
  });

  it("pins a Capacitor 7 minor that supports adjustMarginsForEdgeToEdge, plus status-bar 7", () => {
    const pkg = JSON.parse(read("package.json"));
    for (const name of ["@capacitor/core", "@capacitor/android", "@capacitor/ios"]) {
      expect(pkg.dependencies[name]).toBe("~7.2.0");
    }
    expect(pkg.devDependencies["@capacitor/cli"]).toBe("~7.2.0");
    expect(pkg.dependencies["@capacitor/status-bar"]).toMatch(/^~7\./);
    const decl = read("node_modules/@capacitor/cli/dist/declarations.d.ts");
    expect(decl).toContain("adjustMarginsForEdgeToEdge?: 'auto' | 'force' | 'disable'");
    // Asset generation and the app icon background are night too (decision #45).
    expect(pkg.scripts["app:assets"]).not.toMatch(/#fc8b6d/i);
    expect(pkg.scripts["app:assets"].match(/'#0b0820'/g)).toHaveLength(4);
  });

  it("Android resources: night launcher background, system splash (v31) and legacy splash theme", () => {
    const res = "android/app/src/main/res";
    expect(read(`${res}/values/ic_launcher_background.xml`)).toMatch(/<color name="ic_launcher_background">#0B0820<\/color>/);
    expect(read(`${res}/values/colors.xml`)).toMatch(/<color name="tt_night_900">#0B0820<\/color>/);
    const styles = read(`${res}/values/styles.xml`);
    expect(styles).toMatch(/<item name="windowSplashScreenBackground">@color\/tt_night_900<\/item>/);
    expect(styles.match(/<item name="android:windowBackground">@color\/tt_night_900<\/item>/g)?.length).toBe(3);
    const v31 = read(`${res}/values-v31/styles.xml`);
    expect(v31).toMatch(/<item name="android:windowSplashScreenBackground">@color\/tt_night_900<\/item>/);
  });

  it("iOS launch screen paints night-900 instead of the system (white) background", () => {
    const sb = read("ios/App/App/Base.lproj/LaunchScreen.storyboard");
    expect(sb).not.toContain('systemColor="systemBackgroundColor"');
    expect(sb).toContain('red="0.043137254901960784" green="0.031372549019607843" blue="0.12549019607843137"');
    expect(Math.round(0.043137254901960784 * 255)).toBe(0x0b);
    expect(Math.round(0.031372549019607843 * 255)).toBe(0x08);
    expect(Math.round(0.12549019607843137 * 255)).toBe(0x20);
  });

  it("iOS icon and splash PNGs are RGB with no alpha (App Store rejects an alpha 1024 icon, ITMS-90717)", () => {
    const assets = "ios/App/App/Assets.xcassets";
    const pngs = [
      `${assets}/AppIcon.appiconset/AppIcon-512@2x.png`,
      ...fs
        .readdirSync(path.join(CLIENT, `${assets}/Splash.imageset`))
        .filter((f) => f.endsWith(".png"))
        .map((f) => `${assets}/Splash.imageset/${f}`),
    ];
    expect(pngs).toHaveLength(7);
    for (const f of pngs) {
      const buf = fs.readFileSync(path.join(CLIENT, f));
      expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
      // IHDR colour type at byte 25: 2 = truecolour RGB (6 = RGBA, 4 = grey + alpha, 3 = palette).
      expect({ f, colourType: buf[25] }).toEqual({ f, colourType: 2 });
    }
  });

  it("applyNativeChrome sets the dark style (light text) and the Android bar colour on native only", async () => {
    const calls: string[] = [];
    const StatusBar = {
      setStyle: jest.fn(async (o: { style: string }) => void calls.push(`style:${o.style}`)),
      setBackgroundColor: jest.fn(async (o: { color: string }) => void calls.push(`bg:${o.color}`)),
    };
    const loadStatusBar = jest.fn(async () => ({ StatusBar, Style: { Dark: "DARK" } }));

    expect(await applyNativeChrome({ isNative: () => false, platform: () => "web", loadStatusBar })).toBe(false);
    expect(loadStatusBar).not.toHaveBeenCalled();

    expect(await applyNativeChrome({ isNative: () => true, platform: () => "ios", loadStatusBar })).toBe(true);
    expect(calls).toEqual(["style:DARK"]);

    calls.length = 0;
    expect(await applyNativeChrome({ isNative: () => true, platform: () => "android", loadStatusBar })).toBe(true);
    expect(calls).toEqual(["style:DARK", `bg:${THEME_COLOR}`]);
  });

  it("a status-bar failure is reported and never thrown", async () => {
    const report = jest.fn();
    const ok = await applyNativeChrome({
      isNative: () => true,
      platform: () => "android",
      loadStatusBar: async () => {
        throw new Error("plugin not implemented");
      },
      report,
    });
    expect(ok).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("_app mounts NativeChrome client-only", () => {
    const app = read("pages/_app.tsx");
    expect(app).toMatch(/dynamic\(\(\) => import\("@\/components\/native\/NativeChrome"\), \{\s*ssr: false,\s*\}\)/);
    expect(app).toContain("<NativeChrome />");
  });
});
