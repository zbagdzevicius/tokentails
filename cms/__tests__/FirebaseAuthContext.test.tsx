/** @jest-environment jsdom */

/**
 * FirebaseAuthContext Unit Test Suite (Authentication State + Session Controls)
 *
 * Business Domain / Responsibility
 * - Verifies the unit responsibilities of `context/FirebaseAuthContext.tsx`, which owns:
 *   - Auth state transitions (signed-out vs signed-in) via Firebase Auth callbacks
 *   - Session-scoped access token storage/cleanup (via `sessionStorage`)
 *   - UI gating between the SignIn modal and protected children content
 *   - Profile hydration wiring through React Query and ProfileContext boundaries
 *   - Consumer hook actions (`signIn`, `logout`, `showSignInPopup`) and their contract/guardrails
 *
 * Regulatory / Compliance Context (GDPR / Security)
 * - GDPR / privacy-by-design: These tests prove access tokens are stored only in session scope and are cleared
 *   on signed-out transitions, reducing retention risk and exposure surface.
 * - Security / access control: These tests verify sign-in routing and logout wiring so session termination and
 *   identity provider selection remain correct and auditable.
 *
 * Architecture Notes (Boundaries & Doubles)
 * - Firebase SDK modules (`firebase/app`, `firebase/auth`) are treated as external boundaries and fully mocked.
 * - Profile data retrieval is treated as an external boundary:
 *   - `@tanstack/react-query` is mocked at the hook boundary (`useQuery`).
 *   - `USER_API.profileFetch` is mocked and never reaches the network.
 * - UI dependency `components/SignIn` is mocked to a sentinel element to ensure deterministic rendering checks.
 * - Interval scheduling is mocked to avoid background timers during unit tests.
 *
 * Test Data Strategy / Fixtures
 * - Uses minimal marker objects for a "Firebase user" (`{ uid, getIdToken }`) with no PII.
 * - Uses small, explicit token strings (e.g., `test-token`) to verify formatting rules (`fb` prefix).
 *
 * Cross-References
 * - `context/FirebaseAuthContext.tsx` business rules:
 *   - Signed-out: clears `sessionStorage['accesstoken']` and clears profile via `setProfile(null)`
 *   - Signed-in: stores `sessionStorage['accesstoken']` with `fb` prefix and hides the SignIn modal
 *   - Credential sign-in: falls back to account creation only for `auth/user-not-found`
 *   - Hook contract: throws "useFirebaseAuth must be used within a FirebaseAuthProvider" when misused
 */

import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAuth: { currentUser: unknown } = { currentUser: null };
let setIntervalSpy: jest.SpyInstance;
let clearIntervalSpy: jest.SpyInstance;

const mockGoogleProvider = { providerId: 'google' };
const mockAppleProvider = { providerId: 'apple.com' };

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({}))
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn().mockImplementation(function () {
    return mockGoogleProvider;
  }),
  OAuthProvider: jest.fn().mockImplementation(function (providerId: string) {
    return providerId === 'apple.com' ? mockAppleProvider : { providerId };
  }),
  createUserWithEmailAndPassword: jest.fn(),
  getAuth: jest.fn(() => mockAuth),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn()
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn()
}));

jest.mock('../context/ProfileContext', () => ({
  useProfile: jest.fn()
}));

jest.mock('@/api/user-api', () => ({
  USER_API: { profileFetch: jest.fn() }
}));

jest.mock('../components/SignIn', () => {
  const React = require('react') as typeof import('react');
  return {
    SignIn: jest.fn(() =>
      React.createElement('div', { 'data-testid': 'signin-modal' })
    )
  };
});

const getContextModule = () =>
  require('../context/FirebaseAuthContext') as typeof import('../context/FirebaseAuthContext');

const getMockFirebaseAuth = () =>
  require('firebase/auth') as typeof import('firebase/auth');

const getMockUseQuery = () => {
  const { useQuery } =
    require('@tanstack/react-query') as typeof import('@tanstack/react-query');
  return useQuery as unknown as jest.Mock;
};

const getMockUseProfile = () => {
  const { useProfile } =
    require('../context/ProfileContext') as typeof import('../context/ProfileContext');
  return useProfile as unknown as jest.Mock;
};

const getMockUserApi = () =>
  require('@/api/user-api') as typeof import('@/api/user-api');

type MockProfileContext = {
  setProfile: jest.Mock;
  setUtils: jest.Mock;
};

const arrangeProfileContext = (
  overrides?: Partial<MockProfileContext>
): MockProfileContext => {
  const ctx: MockProfileContext = {
    setProfile: jest.fn(),
    setUtils: jest.fn(),
    ...overrides
  };
  getMockUseProfile().mockReturnValue(ctx);
  return ctx;
};

const arrangeUseQuery = (overrides?: {
  data?: unknown;
  refetch?: jest.Mock;
  capture?: (options: unknown) => void;
}) => {
  const refetch = overrides?.refetch ?? jest.fn();
  getMockUseQuery().mockImplementation((options: unknown) => {
    overrides?.capture?.(options);
    return { data: overrides?.data ?? null, refetch };
  });
  return { refetch };
};

const renderWithProvider = (children?: React.ReactNode) => {
  const { FirebaseAuthProvider } = getContextModule();
  return render(
    <FirebaseAuthProvider>
      <div data-testid="protected-children">protected</div>
      {children}
    </FirebaseAuthProvider>
  );
};

const getAuthStateChangedHandler = (): ((user: unknown) => Promise<void>) => {
  const { onAuthStateChanged } = getMockFirebaseAuth();
  const calls = (onAuthStateChanged as unknown as jest.Mock).mock.calls;
  if (!calls.length) {
    throw new Error('Expected Firebase onAuthStateChanged to be registered.');
  }
  return calls[0][1];
};

beforeEach(() => {
  jest.clearAllMocks();

  mockAuth.currentUser = null;

  sessionStorage.clear();
  localStorage.clear();

  getMockUseProfile().mockReset();
  arrangeProfileContext();

  getMockUseQuery().mockReset();
  arrangeUseQuery();

  const { onAuthStateChanged } = getMockFirebaseAuth();
  (onAuthStateChanged as unknown as jest.Mock).mockImplementation(() => jest.fn());

  setIntervalSpy = jest
    .spyOn(global, 'setInterval')
    .mockImplementation((() => 1) as unknown as typeof setInterval);
  clearIntervalSpy = jest
    .spyOn(global, 'clearInterval')
    .mockImplementation((() => undefined) as unknown as typeof clearInterval);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * FirebaseAuthProvider: UI gating and auth-state side effects.
 */
describe('context/FirebaseAuthContext FirebaseAuthProvider', () => {
  /**
   * Scenario: Default unauthenticated render shows the SignIn modal.
   *
   * Given: Provider is mounted with initial state and no auth callback invoked
   * When: The provider renders
   * Then: The SignIn modal is displayed and protected children are not rendered.
   *
   * Compliance note (access control): Ensures authenticated content is not rendered until login state is satisfied.
   */
  it('renders SignIn by default and hides children', () => {
    // Arrange / Act
    renderWithProvider();

    // Assert
    expect(screen.getByTestId('signin-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
  });

  /**
   * Scenario: Profile indicates a completed login state.
   *
   * Given: React Query returns a profile object containing a `name`
   * When: The provider renders
   * Then: The SignIn modal is hidden and protected children are rendered.
   *
   * Compliance note (least disruption): Avoids repeatedly prompting a user who has an established profile context.
   */
  it('renders children when profile contains a name', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });

    // Act
    renderWithProvider();

    // Assert
    await waitFor(() =>
      expect(screen.getByTestId('protected-children')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('signin-modal')).not.toBeInTheDocument();
  });

  /**
   * Scenario: Firebase reports a signed-in user.
   *
   * Given: `onAuthStateChanged` provides a user whose `getIdToken(true)` resolves
   * When: The provider processes the auth callback
   * Then: A session-scoped access token is stored with an `fb` prefix and protected children render.
   *
   * Compliance note (GDPR / security): Proves session-scoped token storage and consistent prefixing for downstream
   * request logic, without persisting tokens beyond the session boundary.
   */
  it('stores a session access token and hides SignIn on signed-in state', async () => {
    // Arrange
    const token = 'test-token';
    const firebaseUser = {
      uid: 'test-user',
      getIdToken: jest.fn().mockResolvedValue(token)
    };
    mockAuth.currentUser = firebaseUser;

    // Act
    renderWithProvider();
    const handler = getAuthStateChangedHandler();
    await act(async () => {
      await handler(firebaseUser);
    });

    // Assert
    await waitFor(() =>
      expect(sessionStorage.getItem('accesstoken')).toBe(`fb${token}`)
    );
    expect(screen.queryByTestId('signin-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
  });

  /**
   * Scenario: Firebase reports a signed-out state.
   *
   * Given: An access token exists in sessionStorage and the profile context is populated
   * When: `onAuthStateChanged` invokes the callback with `null`
   * Then: The token is removed and `setProfile(null)` is invoked to clear user-derived context.
   *
   * Compliance note (GDPR): Proves cleanup of session-scoped authentication material and derived profile state.
   */
  it('clears session token and profile when signed out', async () => {
    // Arrange
    sessionStorage.setItem('accesstoken', 'fbstale-token');
    const { setProfile } = arrangeProfileContext();

    // Act
    renderWithProvider();
    const handler = getAuthStateChangedHandler();
    await act(async () => {
      await handler(null);
    });

    // Assert
    expect(sessionStorage.getItem('accesstoken')).toBeNull();
    expect(setProfile).toHaveBeenCalledTimes(1);
    expect(setProfile).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('signin-modal')).toBeInTheDocument();
  });

  /**
   * Scenario: Profile data becomes available.
   *
   * Given: React Query returns a profile object
   * When: The provider observes the query data
   * Then: The profile is propagated to ProfileContext via `setProfile(profile)`.
   *
   * Compliance note: Uses minimal fixture data to avoid storing or printing sensitive information in test logs.
   */
  it('propagates profile data to ProfileContext when available', async () => {
    // Arrange
    const profile = { name: 'Test User', role: 'admin' };
    const { setProfile } = arrangeProfileContext();
    arrangeUseQuery({ data: profile });

    // Act
    renderWithProvider();

    // Assert
    await waitFor(() => expect(setProfile).toHaveBeenCalledWith(profile));
  });

  /**
   * Scenario: Unauthenticated sessions should not fetch profile details.
   *
   * Given: Initial provider state has `user: null`
   * When: The provider registers the React Query definition
   * Then: The query function resolves to `null` and `USER_API.profileFetch` is not called.
   *
   * Compliance note: Reduces external calls for unauthenticated sessions, minimizing data processing surface.
   */
  it('does not initiate profile fetching when user is null', async () => {
    // Arrange
    const { USER_API } = getMockUserApi();
    let capturedQueryFn: (() => unknown) | undefined;
    arrangeUseQuery({
      capture: (options: any) => {
        capturedQueryFn = options.queryFn;
      }
    });

    // Act
    renderWithProvider();

    // Assert
    if (!capturedQueryFn) {
      throw new Error('Expected React Query options to provide a queryFn.');
    }
    expect(capturedQueryFn()).toBeNull();
    expect(USER_API.profileFetch).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Token storage is session-scoped and formatted consistently.
   *
   * Given: A signed-in user returns an ID token
   * When: The provider stores the access token
   * Then: The token is stored in `sessionStorage` with an `fb` prefix and `localStorage` is not used.
   *
   * Compliance note (GDPR): Demonstrates session-only retention behavior (no persistence across browser restarts).
   */
  it('stores an fb-prefixed token in sessionStorage and not localStorage', async () => {
    // Arrange
    const storageSetItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const token = 'test-token';
    const firebaseUser = {
      uid: 'test-user',
      getIdToken: jest.fn().mockResolvedValue(token)
    };
    mockAuth.currentUser = firebaseUser;

    // Act
    renderWithProvider();
    const handler = getAuthStateChangedHandler();
    await act(async () => {
      await handler(firebaseUser);
    });

    // Assert
    await waitFor(() =>
      expect(sessionStorage.getItem('accesstoken')).toBe(`fb${token}`)
    );
    expect(storageSetItemSpy.mock.instances).not.toContain(localStorage);
  });

  /**
   * Scenario: Token refresh timer should not multiply across auth transitions.
   *
   * Given: The auth state callback is invoked twice with a signed-in user
   * When: The second callback is processed
   * Then: The previous interval is cleared and a new interval is scheduled.
   *
   * Compliance note (operational reliability): Prevents runaway background refresh behavior for long-lived sessions.
   */
  it('clears the previous refresh interval before scheduling a new one', async () => {
    // Arrange
    let intervalId = 0;
    setIntervalSpy.mockImplementation(
      (() => (intervalId += 1)) as unknown as typeof setInterval
    );

    const firebaseUser = {
      uid: 'test-user',
      getIdToken: jest.fn().mockResolvedValue('test-token')
    };
    mockAuth.currentUser = firebaseUser;

    // Act
    renderWithProvider();
    const handler = getAuthStateChangedHandler();
    await act(async () => {
      await handler(firebaseUser);
    });
    const clearCallsAfterFirstAuthCallback = clearIntervalSpy.mock.calls.length;
    await act(async () => {
      await handler(firebaseUser);
    });

    // Assert
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    expect(clearIntervalSpy.mock.calls.length).toBe(
      clearCallsAfterFirstAuthCallback + 1
    );
    expect(clearIntervalSpy.mock.calls[clearIntervalSpy.mock.calls.length - 1][0]).toBe(1);
  });
});

/**
 * useFirebaseAuth: consumer hook actions (sign-in routing, logout, modal prompting).
 */
describe('context/FirebaseAuthContext useFirebaseAuth', () => {
  const Harness = ({ onReady }: { onReady: (api: any) => void }) => {
    const { useFirebaseAuth } = getContextModule();
    const api = useFirebaseAuth();

    React.useEffect(() => {
      onReady(api);
    }, [api, onReady]);

    return <button onClick={() => api.showSignInPopup()}>trigger</button>;
  };

  /**
   * Scenario: Google OAuth sign-in is routed to the correct provider instance.
   *
   * Given: A consumer uses the hook within the provider
   * When: `signIn('google')` is invoked
   * Then: `signInWithPopup(auth, googleProvider)` is called.
   *
   * Compliance note (auditability): Ensures correct provider selection for downstream identity and audit records.
   */
  it('routes google sign-in to signInWithPopup using the Google provider', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });
    const onReady = jest.fn();
    const { signInWithPopup, GoogleAuthProvider } = getMockFirebaseAuth();

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const api = onReady.mock.calls[0][0];
    api.signIn('google');

    // Assert
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).toHaveBeenCalledWith(mockAuth, mockGoogleProvider);
  });

  /**
   * Scenario: Apple OAuth sign-in is routed to the correct provider instance.
   *
   * Given: A consumer uses the hook within the provider
   * When: `signIn('apple')` is invoked
   * Then: `signInWithPopup(auth, appleProvider)` is called.
   *
   * Compliance note (auditability): Ensures correct provider key mapping for identity provider reporting.
   */
  it('routes apple sign-in to signInWithPopup using the Apple provider', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });
    const onReady = jest.fn();
    const { signInWithPopup, OAuthProvider } = getMockFirebaseAuth();

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const api = onReady.mock.calls[0][0];
    api.signIn('apple');

    // Assert
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).toHaveBeenCalledWith(mockAuth, mockAppleProvider);
  });

  /**
   * Scenario: Unsupported provider strings are handled predictably.
   *
   * Given: A consumer invokes `signIn` with an unknown provider key
   * When: `signIn('unsupported-provider')` is invoked
   * Then: `signInWithPopup` is called with `undefined` for the provider argument (documenting current behavior).
   *
   * Compliance note: Treats unexpected inputs explicitly to reduce risk of silently changing auth routing behavior.
   */
  it('passes an undefined provider to signInWithPopup for unsupported provider keys', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });
    const onReady = jest.fn();
    const { signInWithPopup } = getMockFirebaseAuth();

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const api = onReady.mock.calls[0][0];
    api.signIn('unsupported-provider');

    // Assert
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).toHaveBeenCalledWith(mockAuth, undefined);
  });

  /**
   * Scenario: Logout wiring triggers Firebase sign-out.
   *
   * Given: A consumer uses the hook within the provider
   * When: `logout()` is invoked
   * Then: `signOut(auth)` is called once.
   *
   * Compliance note (security): Confirms session termination wiring for access control.
   */
  it('calls Firebase signOut when logout is invoked', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });
    const onReady = jest.fn();
    const { signOut } = getMockFirebaseAuth();

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const api = onReady.mock.calls[0][0];
    api.logout();

    // Assert
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith(mockAuth);
  });

  /**
   * Scenario: Credential sign-in falls back to account creation only when the user is not found.
   *
   * Given: `signInWithEmailAndPassword` rejects with `code: 'auth/user-not-found'`
   * When: `signIn(email, password)` is invoked
   * Then: `createUserWithEmailAndPassword(auth, email, password)` is called.
   *
   * Compliance note (security): Prevents unintended account creation for non-target failure modes by constraining
   * the fallback to the explicit Firebase error code.
   */
  it('creates a user when credential sign-in fails with auth/user-not-found', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });
    const onReady = jest.fn();
    const { signInWithEmailAndPassword, createUserWithEmailAndPassword } =
      getMockFirebaseAuth();

    (signInWithEmailAndPassword as unknown as jest.Mock).mockRejectedValue({
      code: 'auth/user-not-found'
    });

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const api = onReady.mock.calls[0][0];
    api.signIn('user@example.com', 'password123');

    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      mockAuth,
      'user@example.com',
      'password123'
    );
  });

  /**
   * Scenario: Credential sign-in does not create an account on non-target errors.
   *
   * Given: `signInWithEmailAndPassword` rejects with a non-"user-not-found" code
   * When: `signIn(email, password)` is invoked
   * Then: `createUserWithEmailAndPassword` is not called.
   *
   * Compliance note (security): Guards against accidental account creation on wrong-password or other failures.
   */
  it('does not create a user when credential sign-in fails with a different error code', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Test User' } });
    const onReady = jest.fn();
    const { signInWithEmailAndPassword, createUserWithEmailAndPassword } =
      getMockFirebaseAuth();

    (signInWithEmailAndPassword as unknown as jest.Mock).mockRejectedValue({
      code: 'auth/wrong-password'
    });

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const api = onReady.mock.calls[0][0];
    api.signIn('user@example.com', 'password123');

    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  /**
   * Scenario: "Show sign-in popup" recovers the sign-in modal when unauthenticated.
   *
   * Given: `user` is null and the modal is currently hidden (e.g., cached profile with name)
   * When: `showSignInPopup()` is invoked
   * Then: The SignIn modal becomes visible.
   *
   * Compliance note (access control): Ensures the UI can recover to a sign-in prompt when required.
   */
  it('re-displays SignIn when showSignInPopup is called while unauthenticated', async () => {
    // Arrange
    arrangeUseQuery({ data: { name: 'Cached Profile' } });
    const onReady = jest.fn();

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    await waitFor(() =>
      expect(screen.getByTestId('protected-children')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

    // Assert
    expect(screen.getByTestId('signin-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
  });

  /**
   * Scenario: "Show sign-in popup" does not disrupt authenticated sessions.
   *
   * Given: A user is authenticated (provider has processed a signed-in callback)
   * When: `showSignInPopup()` is invoked
   * Then: The modal remains hidden and protected children remain visible.
   *
   * Compliance note (availability): Prevents unintended UI disruption that could impact secure workflows.
   */
  it('does nothing when showSignInPopup is called while authenticated', async () => {
    // Arrange
    const onReady = jest.fn();
    const firebaseUser = {
      uid: 'test-user',
      getIdToken: jest.fn().mockResolvedValue('test-token')
    };
    mockAuth.currentUser = firebaseUser;

    // Act
    renderWithProvider(<Harness onReady={onReady} />);
    const handler = getAuthStateChangedHandler();
    await act(async () => {
      await handler(firebaseUser);
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /trigger/i })
      ).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

    // Assert
    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.queryByTestId('signin-modal')).not.toBeInTheDocument();
  });
});

/**
 * Guardrails: hook contract misuse throws an explicit error.
 */
describe('context/FirebaseAuthContext guardrails', () => {
  /**
   * Scenario: `useFirebaseAuth` is used outside of `FirebaseAuthProvider`.
   *
   * Given: A component evaluates the hook without being wrapped in the provider
   * When: The component renders
   * Then: An explicit provider-requirement error is thrown.
   *
   * Compliance note: Enforces correct architectural wiring to avoid undefined auth behavior in production.
   */
  it('throws a provider-requirement error when used without FirebaseAuthProvider', () => {
    // Arrange
    const expectedMessage =
      'useFirebaseAuth must be used within a FirebaseAuthProvider';

    const { useFirebaseAuth: realUseFirebaseAuth } =
      jest.requireActual('../context/FirebaseAuthContext') as typeof import('../context/FirebaseAuthContext');

    const Probe = () => {
      realUseFirebaseAuth();
      return <div />;
    };

    // Act / Assert
    expect(() => render(<Probe />)).toThrow(expectedMessage);
  });
});
