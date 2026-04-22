/** @jest-environment jsdom */

/**
 * api/api Unit Test Suite (Client-Side Request Utilities)
 *
 * Business Domain / Responsibility
 * - Verifies the client-side API utility layer implemented by `api/api.ts`.
 * - The unit under test is responsible for:
 *   - Waiting for a session-scoped access token before issuing requests
 *   - Constructing consistent JSON request options (headers + body encoding)
 *   - Parsing successful JSON responses (or returning `null` for empty bodies)
 *   - Emitting error payloads to the app event bus (`GameEvents.ERROR`) for UI feedback
 *
 * Regulatory / Compliance Context (GDPR / Security / Auditability)
 * - GDPR / privacy-by-design: Access tokens are sourced from `sessionStorage` (session scope) and not from
 *   `localStorage`, reducing token retention risk and limiting exposure.
 * - Security / access control: Requests must include the current session access token header to enable
 *   consistent backend authorization.
 * - Auditability: Errors are routed via `GameEvents.ERROR` to ensure user-visible feedback and operational
 *   visibility without leaking access tokens into the error stream.
 *
 * Architecture Notes (Boundaries & Doubles)
 * - Network boundary: `global.fetch` is fully mocked; no real network calls occur.
 * - Storage boundary: `sessionStorage` / `localStorage` are jsdom-provided and treated as external boundaries.
 * - Event bus boundary: `@/lib/events` is mocked to a simple `{ GameEvents.ERROR.push }` spy to avoid DOM
 *   event dispatch and to enable deterministic assertions.
 * - Time boundary: `setTimeout` polling in `waitForLocalStorageKey` is controlled using Jest fake timers.
 *
 * Test Data Strategy / Fixtures
 * - Uses small, explicit constant strings for base URL, token, and paths.
 * - Uses lightweight JSON fixtures for response bodies and error payloads.
 *
 * Cross-References
 * - `api/api.ts` business rules:
 *   - Requests must wait until `sessionStorage['accesstoken']` exists.
 *   - Requests always include JSON headers (`Accept`, `Content-Type`) and an `accesstoken` header.
 *   - Successful responses parse JSON when body is non-empty; empty body returns `null`.
 *   - Non-OK responses push parsed error payloads to `GameEvents.ERROR` and return `null`.
 *   - Unexpected failures (network errors / JSON parse errors) push the thrown error, log to console, and return `null`.
 */

jest.mock('@/lib/events', () => ({
  GameEvents: {
    ERROR: {
      push: jest.fn()
    }
  }
}));

type FetchResponseDouble = {
  ok: boolean;
  text: jest.Mock<Promise<string>, []>;
};

const ORIGINAL_BE_URL = process.env.NEXT_PUBLIC_BE_URL;

const DEFAULT_BASE_URL = 'https://example.test';
const DEFAULT_PATH = '/resource';
const SESSION_TOKEN = 'fb-test-token';

const getApiModule = (baseUrl: string = DEFAULT_BASE_URL) => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_BE_URL = baseUrl;
  return require('@/api/api') as typeof import('@/api/api');
};

const getMockErrorPush = () => {
  const { GameEvents } = require('@/lib/events') as typeof import('@/lib/events');
  return GameEvents.ERROR.push as unknown as jest.Mock;
};

const arrangeFetchResolve = (response: FetchResponseDouble) => {
  const fetchMock = jest.fn(async () => response);
  (global as any).fetch = fetchMock;
  return fetchMock;
};

const createResponse = (overrides: Partial<FetchResponseDouble>): FetchResponseDouble => ({
  ok: false,
  text: jest.fn(async () => ''),
  ...overrides
});

describe('api/api waitForLocalStorageKey', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  /**
   * Scenario: Token is already present; no polling delay is required.
   *
   * Given: `sessionStorage['accesstoken']` is set
   * When: `waitForLocalStorageKey()` is called
   * Then: It resolves to the stored token without requiring timer advancement.
   *
   * Compliance note: Uses session-scoped storage, aligning with privacy-by-design retention reduction.
   */
  it('resolves immediately when the key already exists in session storage', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { waitForLocalStorageKey } = getApiModule();

    // Act
    const resolved = await waitForLocalStorageKey();

    // Assert
    expect(resolved).toBe(SESSION_TOKEN);
  });

  /**
   * Scenario: Token is not yet present; polling continues until it appears.
   *
   * Given: `sessionStorage['accesstoken']` is absent initially
   * When: `waitForLocalStorageKey()` is called and time advances
   * Then: It resolves after the token is set and the polling tick executes.
   *
   * Compliance note: Ensures requests do not proceed without session authorization material.
   */
  it('polls until the key exists and then resolves with the stored value', async () => {
    jest.useFakeTimers();
    try {
      // Arrange
      const { waitForLocalStorageKey } = getApiModule();

      // Act
      const promise = waitForLocalStorageKey();
      sessionStorage.setItem('accesstoken', SESSION_TOKEN);
      await jest.advanceTimersByTimeAsync(1000);
      const resolved = await promise;

      // Assert
      expect(resolved).toBe(SESSION_TOKEN);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('api/api getAuthHeaders', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  /**
   * Scenario: Auth headers are derived from the session token.
   *
   * Given: `sessionStorage['accesstoken']` is set
   * When: `getAuthHeaders()` is called
   * Then: It returns `{ accesstoken: <session token> }`.
   *
   * Compliance note: Confirms tokens are pulled from session scope (GDPR-aligned reduced retention).
   */
  it('returns an accesstoken header sourced from sessionStorage', () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { getAuthHeaders } = getApiModule();

    // Act
    const headers = getAuthHeaders();

    // Assert
    expect(headers).toEqual({ accesstoken: SESSION_TOKEN });
  });
});

describe('api/api request', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  /**
   * Scenario: Successful GET returns parsed JSON and sends contract headers.
   *
   * Given: A session token exists and `fetch` resolves `ok: true` with JSON text
   * When: `request('/resource','GET')` is called
   * Then: It returns the parsed object and calls `fetch` with JSON headers and the session token header.
   *
   * Compliance note: Ensures the authorization header is present for backend access control enforcement.
   */
  it('returns parsed JSON for OK responses and sends expected headers', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    const payload = { id: '1', ok: true };
    const fetchMock = arrangeFetchResolve(
      createResponse({ ok: true, text: jest.fn(async () => JSON.stringify(payload)) })
    );

    // Act
    const result = await request<typeof payload>(DEFAULT_PATH, 'GET');

    // Assert
    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_BASE_URL}${DEFAULT_PATH}`, {
      method: 'GET',
      body: undefined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        accesstoken: SESSION_TOKEN
      }
    });
    expect(getMockErrorPush()).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Successful response with an empty body returns `null`.
   *
   * Given: A session token exists and `fetch` resolves `ok: true` with empty text
   * When: `request('/resource','DELETE')` is called
   * Then: It returns `null` to represent an empty response body (e.g., DELETE endpoints).
   */
  it('returns null for OK responses with an empty body', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    arrangeFetchResolve(createResponse({ ok: true, text: jest.fn(async () => '') }));

    // Act
    const result = await request(DEFAULT_PATH, 'DELETE');

    // Assert
    expect(result).toBeNull();
    expect(getMockErrorPush()).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Request body is JSON-stringified when provided.
   *
   * Given: A session token exists and a request body object is provided
   * When: `request('/resource','POST', body)` is called
   * Then: `fetch` receives the body as `JSON.stringify(body)` and includes JSON headers.
   *
   * Compliance note: Ensures no sensitive token is encoded into URLs; authentication stays in headers.
   */
  it('stringifies the request body when provided', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    const body = { name: 'example' };
    const fetchMock = arrangeFetchResolve(
      createResponse({ ok: true, text: jest.fn(async () => JSON.stringify({ ok: true })) })
    );

    // Act
    await request(DEFAULT_PATH, 'POST', body);

    // Assert
    const [, options] = fetchMock.mock.calls[0] as any[];
    expect(options.body).toBe(JSON.stringify(body));
    expect(options.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      accesstoken: SESSION_TOKEN
    });
  });

  /**
   * Scenario: Requests must not proceed until the session access token exists.
   *
   * Given: `sessionStorage['accesstoken']` is initially absent
   * When: `request()` is called and time advances
   * Then: `fetch` is not called until the polling tick observes the token.
   *
   * Compliance note: Prevents accidental unauthorized requests that could generate audit noise or security alerts.
   */
  it('waits for the session token before calling fetch', async () => {
    jest.useFakeTimers();
    try {
      // Arrange
      const { request } = getApiModule();
      const fetchMock = arrangeFetchResolve(
        createResponse({ ok: true, text: jest.fn(async () => JSON.stringify({ ok: true })) })
      );

      // Act
      const promise = request(DEFAULT_PATH, 'GET');
      expect(fetchMock).not.toHaveBeenCalled();
      sessionStorage.setItem('accesstoken', SESSION_TOKEN);
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * Scenario: Request URL is constructed using the configured API base URL.
   *
   * Given: `NEXT_PUBLIC_BE_URL` is set before module import
   * When: `request('/resource','GET')` is called
   * Then: `fetch` receives the concatenated URL `${baseUrl}${path}`.
   */
  it('prefixes request paths with the configured API base URL (captured at import time)', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const baseUrl = 'https://api.example.test';
    const { request } = getApiModule(baseUrl);
    const fetchMock = arrangeFetchResolve(
      createResponse({ ok: true, text: jest.fn(async () => JSON.stringify({ ok: true })) })
    );

    // Act
    await request(DEFAULT_PATH, 'GET');

    // Assert
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}${DEFAULT_PATH}`, expect.any(Object));
  });

  /**
   * Scenario: Non-OK response emits parsed error payload and returns null.
   *
   * Given: A session token exists and `fetch` resolves `ok: false` with a JSON error body
   * When: `request()` is called
   * Then: It returns `null` and pushes the parsed error payload to `GameEvents.ERROR`.
   *
   * Compliance note: The emitted error payload must not leak the session access token into the event stream.
   * Interaction rationale: `GameEvents.ERROR.push` is a critical side-effect used for user feedback and operational signaling.
   */
  it('pushes parsed error payload to GameEvents.ERROR for non-OK responses and returns null', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    const errorPayload = { message: 'Unauthorized' };
    arrangeFetchResolve(
      createResponse({ ok: false, text: jest.fn(async () => JSON.stringify(errorPayload)) })
    );

    // Act
    const result = await request(DEFAULT_PATH, 'GET');

    // Assert
    expect(result).toBeNull();
    expect(getMockErrorPush()).toHaveBeenCalledWith(errorPayload);
    expect(JSON.stringify(getMockErrorPush().mock.calls[0][0])).not.toContain(SESSION_TOKEN);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Backend returns a non-JSON error body; parsing fails.
   *
   * Given: `fetch` resolves `ok: false` and `response.text()` returns invalid JSON
   * When: `request()` is called
   * Then: It returns `null`, pushes the thrown parse error to `GameEvents.ERROR`, and logs to console.
   *
   * Compliance note: Logging supports operational diagnostics; token values must not be logged by this unit.
   */
  it('treats invalid JSON in non-OK responses as an unexpected failure (catch path)', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    arrangeFetchResolve(
      createResponse({ ok: false, text: jest.fn(async () => '<html>error</html>') })
    );

    // Act
    const result = await request(DEFAULT_PATH, 'GET');

    // Assert
    expect(result).toBeNull();
    expect(getMockErrorPush()).toHaveBeenCalledTimes(1);
    expect(getMockErrorPush().mock.calls[0][0]).toBeInstanceOf(Error);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  /**
   * Scenario: Successful response body is non-empty but not valid JSON.
   *
   * Given: `fetch` resolves `ok: true` and `response.text()` returns invalid JSON
   * When: `request()` is called
   * Then: It returns `null`, pushes the thrown parse error to `GameEvents.ERROR`, and logs to console.
   *
   * Compliance note: Ensures errors propagate consistently so the UI can render a user-facing message.
   */
  it('treats invalid JSON in OK responses as an unexpected failure (catch path)', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    arrangeFetchResolve(
      createResponse({ ok: true, text: jest.fn(async () => '{not-json') })
    );

    // Act
    const result = await request(DEFAULT_PATH, 'GET');

    // Assert
    expect(result).toBeNull();
    expect(getMockErrorPush()).toHaveBeenCalledTimes(1);
    expect(getMockErrorPush().mock.calls[0][0]).toBeInstanceOf(Error);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  /**
   * Scenario: Network boundary rejects (offline / connection failure).
   *
   * Given: `fetch` rejects with an error
   * When: `request()` is called
   * Then: It returns `null`, pushes the same error to `GameEvents.ERROR`, and logs with the expected prefix.
   *
   * Compliance note: Provides evidence of operational visibility for reliability incidents without exposing tokens.
   * Interaction rationale: `console.error` is asserted here because diagnostic logging is the required side-effect for unexpected failures.
   */
  it('pushes and logs the thrown error when fetch rejects (network failure)', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    const { request } = getApiModule();
    const error = new Error('network down');
    (global as any).fetch = jest.fn(async () => {
      throw error;
    });

    // Act
    const result = await request(DEFAULT_PATH, 'GET');

    // Assert
    expect(result).toBeNull();
    expect(getMockErrorPush()).toHaveBeenCalledWith(error);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Network Error:', error);
  });

  /**
   * Scenario: Authentication must be sourced from session storage, not local storage.
   *
   * Given: `localStorage['accesstoken']` differs from `sessionStorage['accesstoken']`
   * When: `request()` is called
   * Then: The `accesstoken` header equals the session token and does not equal the local token.
   *
   * Compliance note: Demonstrates GDPR-aligned reduced token retention by enforcing session-scoped sourcing.
   */
  it('uses the session-scoped token rather than localStorage values', async () => {
    // Arrange
    const localToken = 'local-token';
    sessionStorage.setItem('accesstoken', SESSION_TOKEN);
    localStorage.setItem('accesstoken', localToken);
    const { request } = getApiModule();
    const fetchMock = arrangeFetchResolve(
      createResponse({ ok: true, text: jest.fn(async () => JSON.stringify({ ok: true })) })
    );

    // Act
    await request(DEFAULT_PATH, 'GET');

    // Assert
    const [, options] = fetchMock.mock.calls[0] as any[];
    expect(options.headers.accesstoken).toBe(SESSION_TOKEN);
    expect(options.headers.accesstoken).not.toBe(localToken);
  });
});

afterAll(() => {
  process.env.NEXT_PUBLIC_BE_URL = ORIGINAL_BE_URL;
});

