/**
 * Client-side photo preparation (bet #3, docs/plans/yourcat-v2.md §1 S1): type rule, downscale to a
 * JPEG of at most 1600 px, and the 10 MB rule on the file actually sent.
 */
import {
  fitWithin,
  isAcceptedFile,
  MAX_SEND_BYTES,
  prepareUpload,
  sizeBucket,
  type PrepareDeps,
} from "@/components/yourcat/prepareUpload";

const file = (name: string, type: string, bytes = 1000) =>
  new File([new Uint8Array(Math.min(bytes, 64))], name, { type }) as File;

/** A File whose `size` reads as `bytes` without allocating it. */
const sized = (name: string, type: string, bytes: number) => {
  const f = file(name, type);
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

const decodes = (width: number, height: number, out = 200_000): PrepareDeps & { encode: jest.Mock } => {
  const encode = jest.fn(async () => {
    const blob = new Blob([new Uint8Array(16)], { type: "image/jpeg" });
    Object.defineProperty(blob, "size", { value: out });
    return blob;
  });
  return { decode: jest.fn(async () => ({ width, height, close: jest.fn() })), encode };
};

const fails: PrepareDeps = {
  decode: jest.fn(async () => {
    throw new Error("cannot decode");
  }),
  encode: jest.fn(async () => null),
};

describe("type rule", () => {
  it("accepts the five photo types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
      expect(isAcceptedFile({ name: "x", type })).toBe(true);
    }
  });

  it("accepts an empty type with a .heic or .HEIF name (Android, Windows)", () => {
    expect(isAcceptedFile({ name: "IMG_1.heic", type: "" })).toBe(true);
    expect(isAcceptedFile({ name: "IMG_1.HEIF", type: "" })).toBe(true);
  });

  it("refuses a .txt with an empty type and other types", () => {
    expect(isAcceptedFile({ name: "notes.txt", type: "" })).toBe(false);
    expect(isAcceptedFile({ name: "cat.gif", type: "image/gif" })).toBe(false);
  });

  it("prepareUpload refuses a wrong type before decoding", async () => {
    const deps = decodes(100, 100);
    await expect(prepareUpload(file("notes.txt", ""), deps)).resolves.toEqual({ ok: false, reason: "type" });
    expect(deps.decode).not.toHaveBeenCalled();
  });
});

describe("downscale", () => {
  it("resizes a decodable image to at most 1600 px as photo.jpg", async () => {
    const deps = decodes(4000, 3000);
    const result = await prepareUpload(file("cat.png", "image/png"), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 1600, 1200);
    expect(result.filename).toBe("photo.jpg");
    expect(result.resized).toBe(true);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.fileType).toBe("png");
  });

  it("never enlarges", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 4800)).toEqual({ width: 400, height: 1600 });
  });

  it("sends an undecodable file as it is", async () => {
    const original = file("IMG_2.heic", "");
    const result = await prepareUpload(original, fails);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file).toBe(original);
    expect(result.filename).toBe("IMG_2.heic");
    expect(result.resized).toBe(false);
    expect(result.fileType).toBe("heic");
  });
});

describe("size rule", () => {
  it("applies 10 MB to the file actually sent", async () => {
    // 12 MB in, 2 MB out: fine.
    const small = await prepareUpload(sized("big.jpg", "image/jpeg", 12 * 1024 * 1024), decodes(4000, 3000, 2 * 1024 * 1024));
    expect(small.ok).toBe(true);
    if (small.ok) expect(small.sizeBucket).toBe("1to5mb");
    // 12 MB that cannot be decoded is sent as is: too large.
    await expect(prepareUpload(sized("big.heic", "image/heic", 12 * 1024 * 1024), fails)).resolves.toEqual({
      ok: false,
      reason: "size",
    });
    // A resized file over the limit is refused too.
    await expect(
      prepareUpload(sized("big.png", "image/png", 30 * 1024 * 1024), decodes(9000, 9000, MAX_SEND_BYTES + 1)),
    ).resolves.toEqual({ ok: false, reason: "size" });
  });

  it("refuses anything over 40 MB before decoding", async () => {
    const deps = decodes(100, 100);
    await expect(prepareUpload(sized("huge.jpg", "image/jpeg", 41 * 1024 * 1024), deps)).resolves.toEqual({
      ok: false,
      reason: "size",
    });
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it("buckets sizes", () => {
    expect(sizeBucket(500_000)).toBe("lt1mb");
    expect(sizeBucket(3 * 1024 * 1024)).toBe("1to5mb");
    expect(sizeBucket(9 * 1024 * 1024)).toBe("5to10mb");
  });
});
