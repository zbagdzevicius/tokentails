/**
 * @jest-environment jsdom
 */
import { checkName, nameMessage, SURPRISE_NAMES, surpriseName } from "@/components/onboarding/names";
import { clearDraft, DRAFT_TTL_MS, readDraft, saveDraft } from "@/components/onboarding/draft";
import { STARTERS, STARTER_ORDER } from "@/components/onboarding/starters";
import { StarterBreed } from "@/shared-contracts/enums";
import { ErrorCode } from "@/shared-contracts/errors";
import { CAT_NAME_MESSAGES } from "@/shared-contracts/name";
import fs from "fs";
import path from "path";

/** Name step validation, Surprise me, the starter roster and the offline draft (plan G3). */

describe("name validation messages", () => {
  it.each([
    ["", ErrorCode.NAME_TOO_SHORT, "Use at least 2 characters."],
    ["x", ErrorCode.NAME_TOO_SHORT, "Use at least 2 characters."],
    ["Abcdefghijklmnopq", ErrorCode.NAME_TOO_LONG, "Use at most 16 characters."],
    ["Ni$mbus", ErrorCode.NAME_CHARS, "Use letters, numbers, spaces, apostrophes or hyphens."],
    ["Admin", ErrorCode.NAME_RESERVED, "That name is taken. Try another one."],
  ])("%j gives %s", (raw, code, message) => {
    const check = checkName(raw);
    expect(check).toEqual({ ok: false, code, message });
    expect(nameMessage(code as keyof typeof CAT_NAME_MESSAGES)).toBe(message);
  });

  it("accepts the golden-path and diacritic names, normalised", () => {
    expect(checkName("Nimbus")).toEqual({ ok: true, name: "Nimbus" });
    expect(checkName("  O’Malley ")).toEqual({ ok: true, name: "O'Malley" });
    expect(checkName("Žvaigždutė")).toEqual({ ok: true, name: "Žvaigždutė" });
  });

  it("rejects the featured real-cat names passed as reserved", () => {
    expect(checkName("kretis", ["Kretis"])).toMatchObject({ ok: false, code: ErrorCode.NAME_RESERVED });
    expect(checkName("Nimbus", ["Kretis"])).toEqual({ ok: true, name: "Nimbus" });
  });

  it("blocks unkind names", () => {
    expect(checkName("Shitface")).toMatchObject({ ok: false, code: ErrorCode.NAME_BLOCKED, message: "Please choose a kinder name." });
  });
});

describe("Surprise me", () => {
  it("every name in the pool passes the shared contract", () => {
    for (const name of SURPRISE_NAMES) expect(checkName(name)).toEqual({ ok: true, name });
  });

  it("never offers the current name or a reserved one", () => {
    for (let i = 0; i < 50; i += 1) {
      const name = surpriseName("Nimbus", ["Biscuit"], () => i / 50);
      expect(name).not.toBe("Nimbus");
      expect(name).not.toBe("Biscuit");
      expect(checkName(name).ok).toBe(true);
    }
  });

  it("keeps the current name when the pool is exhausted", () => {
    expect(surpriseName("Nimbus", SURPRISE_NAMES)).toBe("Nimbus");
  });
});

describe("starter roster (decision #19)", () => {
  it("offers Scout, Pinkie, Shadow, Misty and Sunny, Scout first with the altar badge", () => {
    expect(STARTER_ORDER).toEqual([StarterBreed.SCOUT, StarterBreed.PINKIE, StarterBreed.SHADOW, StarterBreed.MISTY, StarterBreed.SUNNY]);
    expect(STARTER_ORDER.map((breed) => STARTERS[breed].name)).toEqual(["Scout", "Pinkie", "Shadow", "Misty", "Sunny"]);
    expect(STARTERS[StarterBreed.SCOUT].badge).toBe("The one from the altar");
    expect(STARTERS[StarterBreed.SCOUT].family).toBe("RASCAL");
  });

  it("every starter's art ships in public/cats/starters", () => {
    for (const breed of STARTER_ORDER) {
      for (const file of [STARTERS[breed].idle, STARTERS[breed].still]) {
        expect(fs.existsSync(path.join(__dirname, "..", "public", file))).toBe(true);
      }
    }
  });

  it("the client looks match the backend STARTER_ART families", () => {
    const backend = fs.readFileSync(path.join(__dirname, "..", "..", "backend", "src", "user", "guest", "starter.ts"), "utf8");
    expect(backend).toContain("RASCAL/base.png");
    for (const breed of STARTER_ORDER.filter((value) => value !== StarterBreed.SCOUT)) {
      const look = STARTERS[breed];
      expect(backend).toContain(`art('${look.family}', '${look.variant}')`);
    }
  });
});

describe("offline starter draft", () => {
  beforeEach(() => clearDraft());

  it("is kept per uid and read back only for that uid", () => {
    saveDraft({ uid: "u1", breed: StarterBreed.MISTY, name: "Nimbus" }, 1000);
    expect(readDraft("u2", 2000)).toBeNull();
    expect(readDraft("u1", 2000)).toMatchObject({ uid: "u1", breed: StarterBreed.MISTY, name: "Nimbus", skipped: false });
  });

  it("expires and ignores junk", () => {
    saveDraft({ uid: "u1", breed: StarterBreed.MISTY }, 0);
    expect(readDraft("u1", DRAFT_TTL_MS + 1)).toBeNull();
    localStorage.setItem("tt.starterDraft", JSON.stringify({ uid: "u1", breed: "TIGER", savedAt: 1 }));
    expect(readDraft("u1", 2)).toBeNull();
    localStorage.setItem("tt.starterDraft", "{not json");
    expect(readDraft("u1", 2)).toBeNull();
    expect(readDraft(null)).toBeNull();
  });

  it("survives blocked storage", () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveDraft({ uid: "u1", breed: StarterBreed.SCOUT })).not.toThrow();
    spy.mockRestore();
  });
});
