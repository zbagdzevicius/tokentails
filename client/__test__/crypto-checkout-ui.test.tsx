/**
 * @jest-environment jsdom
 */
import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { config, order, splitOption, TX, APPROVE_TX, DATA, USDC } from "./crypto-pay-fixtures";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn() }));

import { CryptoCheckout, walletBrowserLinks } from "@/components/web3/crypto/CryptoCheckout";
import { PENDING_KEY } from "@/components/web3/crypto/checkout";
import type { Eip1193 } from "@/components/shelter-payouts/wallet";

type Reply = { status: number; body: unknown };
let routes: Record<string, Reply[]>;
const calls: { url: string; init?: RequestInit }[] = [];

function reply(key: string, ...r: Reply[]) {
  routes[key] = (routes[key] || []).concat(r);
}

beforeEach(() => {
  routes = {};
  calls.length = 0;
  window.localStorage.clear();
  window.sessionStorage.setItem("accesstoken", "fbtest");
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const method = init?.method || "GET";
    const path = url.replace(/^.*?\/payments\/crypto/, "");
    const key = `${method} ${path.replace(/co_[0-9a-f]+/, ":id")}`;
    const queue = routes[key];
    if (!queue?.length) throw new Error(`no route for ${key}`);
    const r = queue.length > 1 ? queue.shift()! : queue[0];
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
  });
});

const PACK = { kind: "PACK" as const, packType: "STARTER" as const };

describe("CryptoCheckout", () => {
  it("says it is closed when the server has it off", async () => {
    reply("GET /config", { status: 200, body: config({ enabled: false, chains: [] }) });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} />);
    expect(await screen.findByTestId("crypto-pay-closed")).toHaveTextContent(/not open yet/);
  });

  it("quotes per coin, then shows the exact amount, address and QR without a wallet", async () => {
    reply("GET /config", { status: 200, body: config() });
    reply("POST /orders", { status: 201, body: order() });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} />);

    expect(await screen.findByTestId("crypto-pay-quote")).toHaveTextContent("5.00 USDC");
    fireEvent.click(screen.getByLabelText("EURC"));
    expect(screen.getByTestId("crypto-pay-quote")).toHaveTextContent("4.50 EURC");
    expect(screen.getByTestId("crypto-pay-eurc-note")).toHaveTextContent("EURC at 0.9 EURC per US dollar (rate of 2026-10-04).");
    expect(screen.getByText(/Test network/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("crypto-pay-amount")).toHaveTextContent("5.000137 EURC");
    const create = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body))).toEqual({ sku: PACK });
    expect((create?.init?.headers as Record<string, string>).accesstoken).toBe("fbtest");

    expect(screen.getByTestId("crypto-pay-manual")).toBeTruthy();
    // QR payments must come from the buyer's own wallet: an exchange fee breaks the exact amount.
    expect(screen.getByTestId("crypto-pay-own-wallet")).toHaveTextContent(/Exchange withdrawals that take a fee will not match/);
    expect(screen.getByTestId("crypto-pay-qr")).toBeTruthy();
    expect(screen.getByTestId("crypto-pay-recipient")).toHaveTextContent(order().accepted[0].recipient);
    expect(screen.getByText("Open in MetaMask")).toBeTruthy();
    expect(screen.getByTestId("crypto-pay-countdown").textContent).toMatch(/^(30:00|29:5\d)$/);
  });

  it("quotes the server's price, not the caller's copy (Legendary card $400, charged $350)", async () => {
    reply("GET /config", { status: 200, body: config() });
    render(<CryptoCheckout sku={{ kind: "PACK", packType: "LEGENDARY" }} priceUsd={400} provider={null} />);
    expect(await screen.findByTestId("crypto-pay-quote")).toHaveTextContent("350.00 USDC");
  });

  it("steps a long amount down a size so it never runs under COPY", async () => {
    reply("GET /config", { status: 200, body: config() });
    const long = order();
    long.accepted = long.accepted.map((o) => ({ ...o, amountDisplay: "350.004173" }));
    reply("POST /orders", { status: 201, body: long });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    const amount = await screen.findByTestId("crypto-pay-amount");
    expect(amount.firstElementChild?.className).toMatch(/text-p3/);
    expect(amount).toHaveTextContent("350.004173");
  });

  it("asks for a browser wallet on a memo network", async () => {
    reply("GET /config", { status: 200, body: config() });
    reply("POST /orders", { status: 201, body: order() });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} />);
    fireEvent.click(await screen.findByLabelText("Tempo Testnet"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("crypto-pay-needs-wallet")).toHaveTextContent(/needs a browser wallet/);
    expect(screen.getByTestId("crypto-pay-amount")).toHaveTextContent("5 pathUSD");
  });

  it("confirms a pasted transaction through 202 to a receipt", async () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    try {
      reply("GET /config", { status: 200, body: config() });
      reply("POST /orders", { status: 201, body: order() });
      reply(
        "POST /orders/:id/confirm",
        { status: 202, body: { orderId: "co_9f2c4e1a7b3d5e60", status: "CONFIRMING", confirmations: 1, required: 2 } },
        { status: 200, body: { orderId: "co_9f2c4e1a7b3d5e60", status: "COMPLETE", success: true, message: "Congratz on your new cat!", cat: { name: "Mochi" } } }
      );
      const onSuccess = jest.fn();
      const onProcessing = jest.fn();
      render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} onSuccess={onSuccess} onProcessingChange={onProcessing} />);
      fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
      const input = await screen.findByPlaceholderText("0x…");
      fireEvent.change(input, { target: { value: "0x12" } });
      fireEvent.click(screen.getByRole("button", { name: /check payment/i }));
      expect(await screen.findByTestId("crypto-pay-error")).toHaveTextContent(/transaction hash/);

      fireEvent.change(input, { target: { value: TX } });
      fireEvent.click(screen.getByRole("button", { name: /check payment/i }));
      expect(await screen.findByText(/1 of 2 blocks/)).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem(PENDING_KEY) || "[]")[0]).toMatchObject({ txHash: TX, chainId: 84532 });
      expect(onProcessing).toHaveBeenLastCalledWith(true);

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(await screen.findByTestId("crypto-pay-receipt")).toHaveTextContent(/Payment confirmed/);
      expect(screen.getByTestId("crypto-pay-receipt")).toHaveTextContent("5.000137 USDC");
      expect(screen.getByRole("link", { name: /0xabab/ })).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${TX}`);
      expect(onSuccess).toHaveBeenCalledWith({ success: true, message: "Congratz on your new cat!", cat: { name: "Mochi" } });
      expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
      expect(onProcessing).toHaveBeenLastCalledWith(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the expiry and starts over", async () => {
    reply("GET /config", { status: 200, body: config() });
    reply("POST /orders", { status: 201, body: order({ expiresAt: new Date(Date.now() - 1000).toISOString() }) });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("crypto-pay-expired")).toHaveTextContent(/expired/);
    fireEvent.click(screen.getByRole("button", { name: /start a new order/i }));
    expect(await screen.findByRole("button", { name: /continue/i })).toBeTruthy();
  });

  it("never starts a wallet payment with under 2 minutes left; offers a new order instead", async () => {
    const eth: Eip1193 = { request: jest.fn(async () => { throw new Error("must not be called"); }) };
    reply("GET /config", { status: 200, body: config() });
    reply("POST /orders", { status: 201, body: order({ expiresAt: new Date(Date.now() + 90 * 1000).toISOString() }) });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={eth} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("crypto-pay-closing")).toHaveTextContent(/under 2 minutes/);
    expect(screen.queryByRole("button", { name: /pay with wallet/i })).toBeNull();
    expect(eth.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /start a new order/i }));
    expect(await screen.findByRole("button", { name: /continue/i })).toBeTruthy();
  });

  it("keeps the pasted-hash field when a QR buyer's order is closing", async () => {
    reply("GET /config", { status: 200, body: config() });
    reply("POST /orders", { status: 201, body: order({ expiresAt: new Date(Date.now() + 90 * 1000).toISOString() }) });
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("crypto-pay-closing")).toHaveTextContent(/Paste its transaction hash below/);
    expect(screen.getByPlaceholderText("0x…")).toBeTruthy();
  });

  it("explains a refused order", async () => {
    reply("GET /config", { status: 200, body: config() });
    reply("POST /orders", { status: 409, body: { statusCode: 409, code: "CRYPTO_PAY_ALREADY_OWNED", message: "owned" } });
    render(<CryptoCheckout sku={{ kind: "CAT", catId: "67b48fafd6c26c6cd40bfec6" }} priceUsd={5} provider={null} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("crypto-pay-error")).toHaveTextContent(/already have this cat/);
  });

  it("pays the shelter split from a browser wallet: approve, then disburse", async () => {
    const sent: string[] = [];
    let receipts = 0;
    const eth: Eip1193 = {
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts") return ["0x9999999999999999999999999999999999999999"];
        if (method === "eth_chainId") return "0x4cef52";
        if (method === "eth_call") return "0x" + (10_000_000).toString(16).padStart(64, "0");
        if (method === "eth_sendTransaction") {
          const tx = (params as { data: string }[])[0];
          sent.push(tx.data);
          return sent.length === 1 ? APPROVE_TX : TX;
        }
        if (method === "eth_getTransactionReceipt") return ++receipts > 0 ? { status: "0x1" } : null;
        throw new Error(method);
      },
    };
    const cat = order({
      sku: { kind: "CAT", catId: "67b48fafd6c26c6cd40bfec6", tier: "COMMON", name: "Mochi" },
      accepted: [splitOption()],
      shelterShare: { route: "split", bps: null, evidenceTier: "onchain-shelter-held", state: "paid" },
    });
    reply("GET /config", { status: 200, body: config({ chains: [{ chainId: 5042002, name: "Arc Testnet", testnet: true, explorer: "", confirmations: 1, tokens: [{ token: "USDC", symbol: "USDC", address: USDC, decimals: 6 }] }] }) });
    reply("POST /orders", { status: 201, body: cat });
    reply("POST /orders/:id/confirm", { status: 200, body: { orderId: cat.orderId, status: "COMPLETE", success: true, message: "ok", cat: { name: "Mochi" } } });
    render(<CryptoCheckout sku={{ kind: "CAT", catId: "67b48fafd6c26c6cd40bfec6" }} priceUsd={5} provider={eth} />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /approve and pay/i }));
    expect(await screen.findByTestId("crypto-pay-receipt")).toHaveTextContent("Mochi (basic tier)");
    expect(sent).toEqual([DATA.approve, DATA.disburse]);
  });

  it("offers to finish an unconfirmed payment after a reload", async () => {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([{ orderId: "co_9f2c4e1a7b3d5e60", sku: "PACK:STARTER", chainId: 84532, txHash: TX, savedAt: Date.now() }])
    );
    reply("GET /config", { status: 200, body: config() });
    reply("GET /orders/:id", { status: 200, body: order() });
    reply("POST /orders/:id/confirm", { status: 200, body: { orderId: "co_9f2c4e1a7b3d5e60", status: "COMPLETE", success: true, message: "ok", replay: true } });
    const onSuccess = jest.fn();
    render(<CryptoCheckout sku={PACK} priceUsd={5} provider={null} onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("button", { name: /check again/i }));
    await waitFor(() => expect(screen.getByTestId("crypto-pay-receipt")).toHaveTextContent(/already confirmed/));
    // A replay grants nothing, so the host does not add a second cat.
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("wallet browser links", () => {
  it("opens this page inside a mobile wallet", () => {
    const links = walletBrowserLinks("https://tokentails.com/packs?x=1");
    expect(links[0].url).toBe("https://metamask.app.link/dapp/tokentails.com/packs?x=1");
    expect(links[1].url).toBe("https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Ftokentails.com%2Fpacks%3Fx%3D1");
  });
});
