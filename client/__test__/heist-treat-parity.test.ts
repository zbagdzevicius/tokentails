/**
 * The treat channel is defined twice, once per side, because `shared/**` stays as it is: the host in
 * `client/components/heist/treatBridge.ts`, the Heist in `catnip-heist/src/embed/treat-bridge.ts`.
 * The channel name, version, message types and outcome kinds must match.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { HEIST_TREAT_CHANNEL, HEIST_TREAT_MAX_FIELD, HEIST_TREAT_VERSION } from "@/components/heist/treatBridge";

const heist = readFileSync(join(__dirname, "../../catnip-heist/src/embed/treat-bridge.ts"), "utf8");
const host = readFileSync(join(__dirname, "../components/heist/treatBridge.ts"), "utf8");

describe("heist treat channel parity", () => {
  it("same channel, version and field cap", () => {
    expect(heist).toContain(`TREAT_BRIDGE_CHANNEL = '${HEIST_TREAT_CHANNEL}'`);
    expect(heist).toContain(`TREAT_BRIDGE_VERSION = ${HEIST_TREAT_VERSION};`);
    expect(heist).toContain(`TREAT_MAX_FIELD = ${HEIST_TREAT_MAX_FIELD};`);
  });

  it("every message type is on both sides", () => {
    for (const type of ["treat-hello", "treat-ready", "treat-send", "treat-result", "treat-me", "treat-me-result"]) {
      expect(heist).toContain(`'${type}'`);
      expect(host).toContain(`"${type}"`);
    }
  });

  it("the same outcome kinds", () => {
    const kinds = /TREAT_OUTCOME_KINDS = \[([^\]]+)\]/.exec(heist)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(kinds).toEqual(["sent", "already", "used-up", "paused", "failed", "unavailable"]);
    for (const kind of kinds ?? []) expect(host).toContain(`kind: "${kind}"`);
  });
});
