import fs from "fs";
import path from "path";
import { NIGHT_STRIPE_APPEARANCE, NIGHT_WALLET_KIT_THEME } from "@/components/web3/nightTheme";
import { GOLD, INK, NIGHT, STATES } from "@/design/tokens";

const CLIENT = path.resolve(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(CLIENT, f), "utf8");

describe("third parties in the night language (plan G6)", () => {
  it("Stripe Elements uses the night theme with token variables", () => {
    expect(NIGHT_STRIPE_APPEARANCE.theme).toBe("night");
    expect(NIGHT_STRIPE_APPEARANCE.variables).toMatchObject({
      colorPrimary: GOLD[400],
      colorBackground: NIGHT[700],
      colorText: INK.cream,
      colorDanger: STATES.rust,
    });
    const stripe = read("components/web3/StripePayment.tsx");
    expect(stripe).toContain("appearance: NIGHT_STRIPE_APPEARANCE");
    expect(stripe).not.toMatch(/theme: "stripe"/);
  });

  it("Stripe Elements names only fonts its iframe can load (system stack, no Nunito)", () => {
    // Our /fonts are same-origin only and Google Fonts is banned (F4), so "Nunito" would be a lie.
    const font = NIGHT_STRIPE_APPEARANCE.variables?.fontFamily ?? "";
    expect(font).toMatch(/^system-ui,/);
    expect(font).not.toMatch(/nunito/i);
  });

  it("the wallet kit theme has every SwkAppTheme key, from tokens", () => {
    const kitTypes = read("node_modules/@creit.tech/stellar-wallets-kit/esm/types/components.d.ts");
    const block = /export type SwkAppTheme = \{([\s\S]*?)\};/.exec(kitTypes)![1];
    const keys = (block.match(/"[\w-]+":/g) || []).map((k) => k.slice(1, -2)).sort();
    expect(Object.keys(NIGHT_WALLET_KIT_THEME).sort()).toEqual(keys);
    expect(NIGHT_WALLET_KIT_THEME.background).toBe(NIGHT[700]);
    expect(NIGHT_WALLET_KIT_THEME.primary).toBe(GOLD[400]);
    expect(NIGHT_WALLET_KIT_THEME["primary-foreground"]).toBe(GOLD.ink);
    const init = read("web3/web3-config.tsx");
    expect(init).toMatch(/StellarWalletsKit\.init\(\{[\s\S]*theme: \{ \.\.\.NIGHT_WALLET_KIT_THEME \}/);
  });
});
