import type { Page, Request } from "@playwright/test";
import { API_ORIGIN } from "./backend";

/**
 * Hosts a test page may load from besides its own origin and the mocked backend: fonts, the npm CDN
 * and the media CDNs the landing and game read art from. Add more with `E2E_ALLOWED_HOSTS`
 * (comma-separated hostnames; a leading `.` matches subdomains).
 */
export const DEFAULT_ALLOWED_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  ".cdn.digitaloceanspaces.com",
  ".digitaloceanspaces.com",
  "token-tails-pitch.vercel.app",
];

/**
 * Production API hosts. A request to one of these means the build under test points at a real
 * backend (a wrong `NEXT_PUBLIC_BE_URL`), so the test fails instead of silently hitting production.
 * Extend with `E2E_FORBIDDEN_HOSTS`.
 */
export const FORBIDDEN_API_HOSTS = ["api.tokentails.com", ".api.tokentails.com"];

/**
 * Inert Stripe.js served for `js.stripe.com`, so pages that call `loadStripe()` at module load get a
 * resolved promise instead of a real third-party script. Every property is a no-op function whose
 * result is again inert; `then` is left undefined so awaiting a stub never hangs. Stripe's own
 * follow-up hosts (`*.stripe.network`, `m.stripe.com`, ...) are then never requested, and would be
 * aborted if they were. Tests that exercise payments mock Stripe explicitly.
 */
export const STRIPE_STUB_SCRIPT = `(() => {
  const inert = () => new Proxy(function () {}, {
    get: (_target, key) => (key === "then" ? undefined : inert()),
    apply: () => inert(),
  });
  window.Stripe = Object.assign(function Stripe() { return inert(); }, { version: 3 });
})();`;

/** Hosts answered with a local stub instead of being aborted. */
export const STUBBED_HOSTS: Record<string, { contentType: string; body: string }> = {
  "js.stripe.com": { contentType: "application/javascript", body: STRIPE_STUB_SCRIPT },
};

const envList = (value: string | undefined): string[] =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

/** True when `host` equals an entry, or ends with an entry that starts with `.`. */
export function hostMatches(host: string, entries: readonly string[]): boolean {
  const name = host.toLowerCase();
  return entries.some((entry) =>
    entry.startsWith(".") ? name.endsWith(entry) || name === entry.slice(1) : name === entry,
  );
}

export interface BlockedRequest {
  url: string;
  resourceType: string;
}

/**
 * Catch-all `page.route("**\/*")`: requests to the page origin, the backend origin (which
 * `BackendMock` fulfils, since its more specific route is registered later and runs first) and the
 * allowlist continue; Stripe.js gets an inert local stub (`stubbed()`); everything else (analytics,
 * pitch-deck pages, ...) is aborted and listed in `blocked()`. Requests to a production API host are also listed in `forbidden()`, and the fixture
 * fails the test on any.
 */
export class NetworkGuard {
  private readonly blockedRequests: BlockedRequest[] = [];
  private readonly stubbedRequests: string[] = [];
  private readonly forbiddenRequests: string[] = [];
  private readonly allowedHosts: string[];
  private readonly forbiddenHosts: string[];

  constructor(
    private readonly baseURL: string,
    options: { allowedHosts?: string[]; forbiddenHosts?: string[] } = {},
  ) {
    this.allowedHosts = [
      ...DEFAULT_ALLOWED_HOSTS,
      ...envList(process.env.E2E_ALLOWED_HOSTS),
      ...(options.allowedHosts || []),
    ];
    this.forbiddenHosts = [
      ...FORBIDDEN_API_HOSTS,
      ...envList(process.env.E2E_FORBIDDEN_HOSTS),
      ...(options.forbiddenHosts || []),
    ];
  }

  /** Requests that were aborted because their host is not allowed. */
  blocked(): BlockedRequest[] {
    return [...this.blockedRequests];
  }

  /** URLs answered with a local stub (`STUBBED_HOSTS`). */
  stubbed(): string[] {
    return [...this.stubbedRequests];
  }

  /** URLs of requests that went to a production API host. */
  forbidden(): string[] {
    return [...this.forbiddenRequests];
  }

  /** Whether a request URL may leave the browser. Exposed for unit use in specs. */
  allows(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }
    if (hostMatches(parsed.hostname, this.forbiddenHosts)) {
      return false;
    }
    if (parsed.origin === new URL(this.baseURL).origin || parsed.origin === new URL(API_ORIGIN).origin) {
      return true;
    }
    return hostMatches(parsed.hostname, this.allowedHosts);
  }

  async install(page: Page): Promise<void> {
    if (hostMatches(new URL(API_ORIGIN).hostname, this.forbiddenHosts)) {
      throw new Error(`E2E_API_URL (${API_ORIGIN}) is a production API host; point it at a local or mocked origin`);
    }
    await page.route("**/*", async (route) => {
      const request: Request = route.request();
      const url = request.url();
      if (this.allows(url)) {
        await route.fallback();
        return;
      }
      const host = safeHost(url);
      if (hostMatches(host, this.forbiddenHosts)) {
        this.forbiddenRequests.push(url);
      }
      const stub = STUBBED_HOSTS[host];
      if (stub && request.resourceType() === "script") {
        this.stubbedRequests.push(url);
        await route.fulfill({ status: 200, contentType: stub.contentType, body: stub.body });
        return;
      }
      this.blockedRequests.push({ url, resourceType: request.resourceType() });
      await route.abort("blockedbyclient");
    });
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
