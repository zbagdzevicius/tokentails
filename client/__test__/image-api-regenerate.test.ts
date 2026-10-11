import { IMAGE_API, PortraitPreviewError, SignInRequiredError } from "@/api/image-api";

jest.mock("@/context/auth/appCheck", () => ({
  getLimitedUseAppCheckToken: jest.fn(async () => "limited-use"),
}));
jest.mock("firebase/app", () => ({ getApp: () => ({}) }));

// Regeneration is a paid generation: a signed-out visitor (401) and a guest regenerating an older
// image without an owner (403 GUEST_FORBIDDEN) must be told to sign in, not "try again".
describe("IMAGE_API.regeneratePortrait", () => {
  beforeEach(() => {
    Object.assign(globalThis, { sessionStorage: { getItem: jest.fn(() => "fbtoken") } });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const respond = (status: number, body: unknown = {}) => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  };

  it("sends the token and a limited-use App Check token", async () => {
    respond(200, { aiUrl: "https://example.test/a.png" });
    await IMAGE_API.regeneratePortrait("img-1", "x");
    const init = (globalThis.fetch as jest.Mock).mock.calls[0][1];
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({ accesstoken: "fbtoken", "x-firebase-appcheck": "limited-use" });
  });

  it("throws SignInRequiredError on 403 GUEST_FORBIDDEN", async () => {
    respond(403, { statusCode: 403, code: "GUEST_FORBIDDEN" });
    await expect(IMAGE_API.regeneratePortrait("img-1")).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it("maps the preview caps and a delivered portrait to plain messages", async () => {
    respond(429, { statusCode: 429, code: "YOURCAT_USER_DAILY_CAP" });
    await expect(IMAGE_API.regeneratePortrait("img-1")).rejects.toBeInstanceOf(PortraitPreviewError);
    respond(409, { statusCode: 409, code: "YOURCAT_PORTRAIT_EXISTS" });
    await expect(IMAGE_API.regeneratePortrait("img-1")).rejects.toThrow(/already been bought/);
  });

  it("resolves null on another 403", async () => {
    respond(403, { statusCode: 403, code: "EMAIL_UNVERIFIED" });
    await expect(IMAGE_API.regeneratePortrait("img-1")).resolves.toBeNull();
  });

  it("throws SignInRequiredError on 401", async () => {
    respond(401);
    await expect(IMAGE_API.regeneratePortrait("img-1")).rejects.toBeInstanceOf(
      SignInRequiredError,
    );
  });

  it("still resolves null on other failures", async () => {
    respond(500);
    await expect(IMAGE_API.regeneratePortrait("img-1")).resolves.toBeNull();
  });

  it("returns the image on success", async () => {
    respond(200, { aiUrl: "https://example.test/a.png" });
    await expect(IMAGE_API.regeneratePortrait("img-1", "x")).resolves.toEqual({
      aiUrl: "https://example.test/a.png",
    });
  });
});
