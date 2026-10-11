import { setAuthBridge } from "@/api/api";
import { IMAGE_API, PortraitPreviewError, SignInRequiredError } from "@/api/image-api";

// The preview routes are paid AI generations behind AppAuthGuard and the AI gate (yourcat-v2.md
// section 6.6): the client creates the guest session first, then sends its token and a limited-use
// App Check token.
const mockGetLimitedUseAppCheckToken = jest.fn();
jest.mock("@/context/auth/appCheck", () => ({
  getLimitedUseAppCheckToken: (...args: unknown[]) => mockGetLimitedUseAppCheckToken(...args),
}));
jest.mock("firebase/app", () => ({ getApp: () => ({ name: "[DEFAULT]" }) }));

const respond = (status: number, body: unknown = {}) => {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return response;
    },
  };
  globalThis.fetch = jest.fn().mockResolvedValue(response);
};

const sentHeaders = () => (globalThis.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;

describe("IMAGE_API.uploadImage (POST /image/portrait)", () => {
  let token = "";
  let removeBridge: () => void = () => undefined;
  const ensureGuestSession = jest.fn(async () => {
    token = "fbguest-token";
    return true;
  });

  beforeEach(() => {
    token = "";
    Object.assign(globalThis, { sessionStorage: { getItem: jest.fn(() => token || null) } });
    removeBridge = setAuthBridge({ ensureGuestSession });
    mockGetLimitedUseAppCheckToken.mockResolvedValue("limited-use-1");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    removeBridge();
    jest.restoreAllMocks();
  });

  const file = () => new File(["cat"], "cat.jpg", { type: "image/jpeg" });

  it("creates the guest session first, then sends accesstoken and a limited-use App Check token", async () => {
    respond(201, { _id: "img-1", aiUrl: "https://example.test/a.png" });
    await expect(IMAGE_API.uploadImage(file(), { name: "cat.jpg", style: "highness" })).resolves.toMatchObject({
      _id: "img-1",
    });
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
    expect(mockGetLimitedUseAppCheckToken).toHaveBeenCalledWith({ name: "[DEFAULT]" });
    const headers = sentHeaders();
    expect(headers.accesstoken).toBe("fbguest-token");
    expect(headers["x-firebase-appcheck"]).toBe("limited-use-1");
    expect((globalThis.fetch as jest.Mock).mock.calls[0][1].method).toBe("POST");
  });

  it("sends no App Check header when App Check is not configured", async () => {
    mockGetLimitedUseAppCheckToken.mockResolvedValue(null);
    respond(201, { _id: "img-1" });
    await IMAGE_API.uploadImage(file());
    expect(sentHeaders()).not.toHaveProperty("x-firebase-appcheck");
  });

  it("maps the daily caps to a plain message", async () => {
    respond(429, { statusCode: 429, code: "YOURCAT_IP_DAILY_CAP", message: "cap" });
    const error = await IMAGE_API.uploadImage(file()).catch((e) => e);
    expect(error).toBeInstanceOf(PortraitPreviewError);
    expect(error.message).toBe("You have made all your previews for today. Please come back tomorrow.");
  });

  it("maps a burst 429 without a code and the budget", async () => {
    respond(429, { statusCode: 429, message: "ThrottlerException: Too Many Requests" });
    await expect(IMAGE_API.uploadImage(file())).rejects.toThrow(/Too many tries at once/);
    respond(503, { statusCode: 503, code: "YOURCAT_BUDGET_EXHAUSTED", message: "budget" });
    await expect(IMAGE_API.uploadImage(file())).rejects.toThrow(/all the previews we can for today/);
  });

  it("still resolves null on other failures", async () => {
    respond(500);
    await expect(IMAGE_API.uploadImage(file())).resolves.toBeNull();
  });
});

describe("IMAGE_API.regeneratePortrait headers", () => {
  let removeBridge: () => void = () => undefined;
  const ensureGuestSession = jest.fn(async () => true);

  beforeEach(() => {
    Object.assign(globalThis, { sessionStorage: { getItem: jest.fn(() => "fbregistered") } });
    removeBridge = setAuthBridge({ ensureGuestSession });
    mockGetLimitedUseAppCheckToken.mockResolvedValue("limited-use-2");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    removeBridge();
    jest.restoreAllMocks();
  });

  it("sends accesstoken and x-firebase-appcheck", async () => {
    respond(200, { aiUrl: "https://example.test/b.png" });
    await IMAGE_API.regeneratePortrait("img-1", "monarch");
    expect(ensureGuestSession).toHaveBeenCalled();
    expect(sentHeaders()).toMatchObject({ accesstoken: "fbregistered", "x-firebase-appcheck": "limited-use-2" });
  });

  it("maps 401 and 403 GUEST_FORBIDDEN to SignInRequiredError", async () => {
    respond(401);
    await expect(IMAGE_API.regeneratePortrait("img-1")).rejects.toBeInstanceOf(SignInRequiredError);
    respond(403, { code: "GUEST_FORBIDDEN" });
    await expect(IMAGE_API.regeneratePortrait("img-1")).rejects.toBeInstanceOf(SignInRequiredError);
  });
});
