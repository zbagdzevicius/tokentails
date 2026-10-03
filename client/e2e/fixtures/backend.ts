import type { Page, Request, Route } from "@playwright/test";
import { NOT_MOCKED, storefrontFixture } from "./contracts";
import { FIXED_NOW } from "./determinism";

/** Backend origin the client was built with (`NEXT_PUBLIC_BE_URL`). */
export const API_ORIGIN = (process.env.E2E_API_URL || "http://localhost:3005").replace(/\/+$/, "");

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type MockHandler = (request: Request) => MockResponse | Promise<MockResponse>;

interface MockRoute {
  method: HttpMethod;
  path: string | RegExp;
  handler: MockHandler;
}

/** One backend call the page made, for assertions. */
export interface RecordedCall {
  method: string;
  path: string;
  /** Header names lower-cased by Playwright. */
  headers: Record<string, string>;
  /**
   * Header names as `request.headersArray()` reports them. In Chromium, `fetch` and XHR lower-case
   * header names before the request leaves the page, so for browser calls these are always
   * lowercase; only hand-built records (unit tests) can carry upper-case names.
   */
  rawHeaderNames: string[];
  body: string | null;
  mocked: boolean;
}

/** Auth-looking header names the API never accepts; the only auth header is lowercase `accesstoken`. */
const WRONG_AUTH_HEADERS = ["authorization", "access-token", "x-access-token", "x-accesstoken"];

/**
 * Header problems in recorded calls: an auth header other than `accesstoken`, `accesstoken` sent
 * with any upper-case letter, or an `accesstoken` value without the `fb` Firebase prefix (API.md:
 * anything else is a 401). Returns one line per problem, so `expect(...).toEqual([])` reads well.
 *
 * The wrong-name and `fb`-prefix checks catch real regressions. The upper-case check cannot fire
 * for a browser request (the browser lower-cases names, see `RecordedCall.rawHeaderNames`); it only
 * guards hand-built records, so a passing run says nothing about the casing in the source. Casing in
 * source is HTTP-irrelevant anyway: the backend reads headers case-insensitively.
 */
export function authHeaderViolations(calls: readonly RecordedCall[]): string[] {
  const problems: string[] = [];
  calls.forEach((call) => {
    const where = `${call.method} ${call.path}`;
    call.rawHeaderNames.forEach((name) => {
      const lower = name.toLowerCase();
      if (lower === "accesstoken" && name !== lower) {
        problems.push(`${where}: header "${name}" must be lowercase "accesstoken"`);
      }
      if (WRONG_AUTH_HEADERS.indexOf(lower) !== -1) {
        problems.push(`${where}: uses "${name}" instead of "accesstoken"`);
      }
    });
    const token = call.headers["accesstoken"];
    if (token !== undefined && !token.startsWith("fb")) {
      problems.push(`${where}: accesstoken is not a Firebase token (missing "fb" prefix)`);
    }
  });
  return problems;
}

/**
 * Mocks every request to `API_ORIGIN` with `page.route`. Defaults cover what a signed-out visitor
 * triggers; tests add or override routes with `on()` (the latest matching route wins). Anything
 * unmatched gets a 404 and is listed in `unmocked()`; the `backend` fixture fails the test on any
 * unmocked call (unless `allowUnmocked`) and on any `authHeaderViolations`. Requests to other hosts
 * are handled by `NetworkGuard` (network.ts).
 */
export class BackendMock {
  private readonly routes: MockRoute[] = [];
  private readonly calls: RecordedCall[] = [];

  constructor() {
    this.on("GET", "/cat/sale", () => ({ body: storefrontFixture() }));
    this.on("GET", "/user/profile", () => ({ status: 401, body: { statusCode: 401, message: "Unauthorized" } }));
    // The lobby impact strip/tile (task 5e, plan G4) reads the public snapshot on every /game visit
    // and `/impact/me` for a registered account. By default both are "unavailable": the client then
    // shows progress copy and the static `/impact/impact.json` snapshot, never a paw claim. Specs
    // that assert on impact data (lobby-impact.spec.ts) override these with `on()`.
    this.on("GET", "/impact", () => ({ status: 503, body: { statusCode: 503, message: "Impact unavailable in e2e" } }));
    this.on("GET", "/impact/me", () => ({ status: 503, body: { statusCode: 503, message: "Impact unavailable in e2e" } }));
    // The end-of-run treat CTA (task 5e) reads the public rail; by default it is not deployed (the
    // honest current state), so no "send a treat" button is offered.
    this.on("GET", "/shelter/donate/status", () => ({
      body: { enabled: false, railState: "not-deployed", treatsLeftToday: 0, resetsAt: FIXED_NOW.toISOString() },
    }));
  }

  on(method: HttpMethod, path: string | RegExp, handler: MockHandler | MockResponse): this {
    const fn: MockHandler = typeof handler === "function" ? handler : () => handler;
    this.routes.unshift({ method, path, handler: fn });
    return this;
  }

  /** Every backend call so far, in order. */
  requests(): RecordedCall[] {
    return [...this.calls];
  }

  /** Calls that no route matched. */
  unmocked(): RecordedCall[] {
    return this.calls.filter((call) => !call.mocked);
  }

  async install(page: Page): Promise<void> {
    await page.route(`${API_ORIGIN}/**`, (route) => this.handle(route));
  }

  private match(method: string, path: string): MockRoute | undefined {
    return this.routes.find(
      (route) =>
        route.method === method &&
        (typeof route.path === "string" ? route.path === path : route.path.test(path)),
    );
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.slice(new URL(API_ORIGIN).pathname.replace(/\/$/, "").length) || "/";
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(request) });
      return;
    }
    const found = this.match(method, path);
    const rawHeaders = await request.headersArray();
    this.calls.push({
      method,
      path,
      headers: request.headers(),
      rawHeaderNames: rawHeaders.map((header) => header.name),
      body: request.postData(),
      mocked: !!found,
    });
    const response = found ? await found.handler(request) : { status: 404, body: NOT_MOCKED };
    await route.fulfill({
      status: response.status ?? 200,
      contentType: "application/json",
      headers: { ...corsHeaders(request), ...(response.headers || {}) },
      body: JSON.stringify(response.body ?? {}),
    });
  }
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "accesstoken, content-type, accept, x-guest-token, x-firebase-appcheck",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
}
