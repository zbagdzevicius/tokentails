import { SHELTER_API } from "@/api/shelter-api";

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
    fetchMock.mockReturnValue(reply(429, { message: "You already sent today's gift. Come back tomorrow!" }));
    expect(await SHELTER_API.donate("page")).toEqual({ status: "already-sent" });
    fetchMock.mockReturnValue(reply(429, { message: "ThrottlerException: Too Many Requests" }));
    expect((await SHELTER_API.donate("page")).status).toBe("error");
  });

  it.each([
    [503, { status: "disabled", message: "off" }],
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
