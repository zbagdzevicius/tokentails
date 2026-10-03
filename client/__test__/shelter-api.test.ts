import { DonateSource, SHELTER_API, ShelterDonationStatus } from "@/api/shelter-api";
import { DONATE_SOURCES } from "@/shared-contracts/enums";

const store: Record<string, string> = {};
(global as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
} as Storage;

const fetchMock = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  fetchMock.mockReset();
  delete store.accesstoken;
});

describe("SHELTER_API.donate", () => {
  it("does not call the server when signed out", async () => {
    expect(await SHELTER_API.donate("page")).toEqual({ status: "signed-out" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the source with the lowercase accesstoken header", async () => {
    store.accesstoken = "fbTOKEN";
    const receipt = { txHash: "0x1", chainId: 5042, amountWei: "1", explorerUrl: "https://explorer.arc.io/tx/0x1" };
    fetchMock.mockReturnValue(reply(200, receipt));
    expect(await SHELTER_API.donate("heist")).toEqual({ status: "sent", receipt });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/shelter\/donate$/);
    expect(init.method).toBe("POST");
    expect(init.headers.accesstoken).toBe("fbTOKEN");
    expect(JSON.parse(init.body)).toEqual({ source: "heist" });
  });

  it("maps the once-a-day 429 to already-sent and a rate-limit 429 to an error", async () => {
    store.accesstoken = "fbTOKEN";
    fetchMock.mockReturnValue(
      reply(429, { code: "DONATE_ALREADY_TODAY", message: "You already sent today's gift. Come back tomorrow!" }),
    );
    expect(await SHELTER_API.donate("page")).toEqual({ status: "already-sent" });
    fetchMock.mockReturnValue(reply(429, { message: "ThrottlerException: Too Many Requests" }));
    expect((await SHELTER_API.donate("page")).status).toBe("error");
    // The code decides, not the wording: a rate-limit message that says "already" is still an error.
    fetchMock.mockReturnValue(reply(429, { message: "already throttled" }));
    expect((await SHELTER_API.donate("page")).status).toBe("error");
  });

  it("treats only a guest 403 (or a code-less one) as signed out", async () => {
    store.accesstoken = "fbTOKEN";
    fetchMock.mockReturnValue(reply(403, { statusCode: 403, code: "GUEST_FORBIDDEN", message: "Guests cannot" }));
    expect(await SHELTER_API.donate("page")).toEqual({ status: "signed-out" });
    fetchMock.mockReturnValue(reply(403, { statusCode: 403, message: "Forbidden" }));
    expect(await SHELTER_API.donate("page")).toEqual({ status: "signed-out" });
  });

  it("maps the treat-policy 403s to not-eligible with the reason", async () => {
    store.accesstoken = "fbTOKEN";
    fetchMock.mockReturnValue(reply(403, { code: "EMAIL_UNVERIFIED", message: "Verify your email to send a treat." }));
    expect(await SHELTER_API.donate("page")).toEqual({
      status: "not-eligible",
      reason: "email-unverified",
      eligibleAt: null,
      message: "Verify your email to send a treat.",
    });
    fetchMock.mockReturnValue(
      reply(403, { code: "DONATE_NOT_ELIGIBLE", reason: "account-too-new", eligibleAt: "2026-10-03T10:00:00.000Z", message: "m" }),
    );
    expect(await SHELTER_API.donate("page")).toEqual({
      status: "not-eligible",
      reason: "account-too-new",
      eligibleAt: "2026-10-03T10:00:00.000Z",
      message: "m",
    });
    fetchMock.mockReturnValue(reply(403, { code: "DONATE_NOT_ELIGIBLE", reason: "no-saved-game", eligibleAt: null }));
    expect(await SHELTER_API.donate("heist")).toMatchObject({ status: "not-eligible", reason: "no-saved-game", eligibleAt: null });
  });

  it.each([
    [503, { status: "disabled", message: "off" }],
    [409, { status: "disabled", message: "off" }],
    [401, { status: "signed-out" }],
    [500, { status: "error", message: "off" }],
  ])("maps HTTP %s", async (code, expected) => {
    store.accesstoken = "fbTOKEN";
    fetchMock.mockReturnValue(reply(code, { message: "off" }));
    expect(await SHELTER_API.donate("page")).toEqual(expected);
  });

  it("reports a network failure", async () => {
    store.accesstoken = "fbTOKEN";
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await SHELTER_API.donate("page")).status).toBe("error");
  });
});

describe("SHELTER_API.getDonateStatus", () => {
  it("returns null when the server is down", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await SHELTER_API.getDonateStatus()).toBeNull();
  });
});

describe("shared donation vocabulary", () => {
  it.each(DONATE_SOURCES.map((source) => [source]))(
    "posts the shared source %s unchanged",
    async (source: DonateSource) => {
      store.accesstoken = "fbTOKEN";
      fetchMock.mockReturnValue(reply(200, { txHash: "0x1", chainId: 1, amountWei: "1", explorerUrl: "" }));
      await SHELTER_API.donate(source);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ source });
    },
  );

  it("types the donation statuses the backend can store", () => {
    const statuses: ShelterDonationStatus[] = [
      "PENDING",
      "SENT",
      "CONFIRMED",
      "FAILED",
    ] as ShelterDonationStatus[];
    expect(statuses).toHaveLength(4);
  });
});
