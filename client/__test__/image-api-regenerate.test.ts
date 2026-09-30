import { IMAGE_API, SignInRequiredError } from "@/api/image-api";

// Regeneration is a paid generation and needs a signed-in user; a 401 must say so, not "try again".
describe("IMAGE_API.regeneratePortrait", () => {
  beforeEach(() => {
    Object.assign(globalThis, { sessionStorage: { getItem: jest.fn(() => null) } });
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
