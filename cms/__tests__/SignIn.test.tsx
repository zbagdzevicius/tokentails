/** @jest-environment jsdom */

/**
 * SignIn Unit Test Suite (UI Authentication Entry)
 *
 * Business Domain / Responsibility
 * - Verifies the CMS authentication entry UI exposed by `components/SignIn.tsx`.
 * - The unit under test is responsible for:
 *   - Presenting credential and provider sign-in options when unauthenticated
 *   - Enforcing minimal client-side validation before initiating sign-in
 *   - Exposing logout when authenticated
 *   - Providing modal close affordances (overlay and close icon button)
 *
 * Regulatory / Compliance Context (GDPR / Security)
 * - These tests provide evidence that the UI:
 *   - Uses correct privacy-preserving input attributes (`type="password"`, `autoComplete`)
 *   - Does not initiate credential processing unless validation thresholds are met (reduces accidental handling)
 * - Provider selection accuracy is asserted so downstream auth/audit systems receive correct provider identifiers.
 *
 * Architecture Notes (Boundaries & Doubles)
 * - `useFirebaseAuth` is treated as an external boundary (auth integration + side-effects).
 * - All tests (except the explicit guardrail test) mock `useFirebaseAuth` to ensure deterministic unit isolation.
 * - The guardrail test intentionally exercises the hook contract error for misuse (without requiring real Firebase).
 *
 * Test Data Strategy / Fixtures
 * - Uses small, explicit strings for email/password and provider identifiers.
 * - Uses a minimal `user` object marker for authenticated state (no PII; no real Firebase user).
 *
 * Cross-References
 * - Business rules from `components/SignIn.tsx`:
 *   - Credential submit requires: `username.length > 0` and `password.length > 5`
 *   - Provider actions: `signIn('google')` and `signIn('apple')`
 * - Hook contract from `context/FirebaseAuthContext.tsx`:
 *   - Throws: "useFirebaseAuth must be used within a FirebaseAuthProvider" when misused
 */

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('../context/FirebaseAuthContext', () => ({
  useFirebaseAuth: jest.fn()
}));

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({}))
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn(),
  OAuthProvider: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn()
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: null, refetch: jest.fn() }))
}));

jest.mock('../context/ProfileContext', () => ({
  useProfile: jest.fn(() => ({ setProfile: jest.fn(), setUtils: jest.fn() }))
}));

jest.mock('@/api/user-api', () => ({
  USER_API: { profileFetch: jest.fn() }
}));

const getMockUseFirebaseAuth = () => {
  const { useFirebaseAuth } =
    require('../context/FirebaseAuthContext') as typeof import('../context/FirebaseAuthContext');
  return useFirebaseAuth as unknown as jest.Mock;
};

const getComponents = () =>
  require('@/components/SignIn') as typeof import('@/components/SignIn');

type MockAuthState = {
  user: unknown;
  signIn: jest.Mock;
  logout: jest.Mock;
};

const arrangeAuthState = (overrides?: Partial<MockAuthState>) => {
  const state: MockAuthState = {
    user: null,
    signIn: jest.fn(),
    logout: jest.fn(),
    ...overrides
  };
  getMockUseFirebaseAuth().mockReturnValue(state);
  return state;
};

/**
 * SignInContent: state-driven rendering and sign-in wiring.
 *
 * - Validates the authenticated vs unauthenticated UI branches.
 * - Validates that only compliant inputs initiate sign-in attempts.
 * - Validates correct provider identifiers for OAuth actions.
 */
describe('components/SignIn SignInContent', () => {
  /**
   * Scenario: Signed-out user sees credential + provider options.
   *
   * Given: `useFirebaseAuth` returns `user: null`
   * When: `SignInContent` is rendered
   * Then: Email/password inputs and submit button are visible, along with provider buttons.
   *
   * Compliance note: Presence of the authentication entry points is required to support lawful access flows.
   */
  it('renders credential inputs and provider buttons when unauthenticated', () => {
    // Arrange
    arrangeAuthState({ user: null });

    // Act
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Assert
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in \/ register/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/sign in with/i)).toBeInTheDocument();
    expect(screen.getByText(/login with/i)).toBeInTheDocument();
  });

  /**
   * Scenario: Input attributes support privacy-respecting browser behavior.
   *
   * Given: A signed-out user
   * When: The form inputs are inspected
   * Then: Password input has `type="password"` and expected autocomplete values are present.
   *
   * Compliance note (GDPR / privacy-by-design): Minimizes accidental exposure by ensuring password masking
   * and appropriate browser-managed credential handling.
   */
  it('uses privacy-preserving input types and autocomplete attributes', () => {
    // Arrange
    arrangeAuthState({ user: null });

    // Act
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Assert
    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');

    expect(emailInput).toHaveAttribute('type', 'text');
    expect(emailInput).toHaveAttribute('autoComplete', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
  });

  /**
   * Scenario: Valid credentials initiate sign-in once with latest values.
   *
   * Given: Non-empty email and password length > 5
   * When: The form is submitted
   * Then: `signIn(email, password)` is called once with the entered values.
   *
   * Compliance note (security): Ensures the UI only forwards credentials once validation thresholds are met,
   * reducing accidental processing/noisy auth calls.
   */
  it('submits credentials only when validation passes and uses latest typed values', () => {
    // Arrange
    const { signIn } = arrangeAuthState({ user: null });
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');

    // Act
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'initial1' } });
    fireEvent.change(passwordInput, { target: { value: 'updatedPassword' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in \/ register/i }));

    // Assert
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith('user@example.com', 'updatedPassword');
  });

  /**
   * Scenario: Invalid credentials do not initiate sign-in.
   *
   * Given: Empty email OR password length <= 5
   * When: The form is submitted
   * Then: `signIn` is not called.
   *
   * Compliance note (security): Prevents accidental credential processing when the minimum UI threshold is not met.
   */
  it('does not submit when email is empty', () => {
    // Arrange
    const { signIn } = arrangeAuthState({ user: null });
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Act
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'longEnough' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in \/ register/i }));

    // Assert
    expect(signIn).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Invalid credentials do not initiate sign-in.
   *
   * Given: Non-empty email AND password length <= 5
   * When: The form is submitted
   * Then: `signIn` is not called.
   *
   * Compliance note (security): Helps ensure that short / accidental password entries are not forwarded.
   */
  it('does not submit when password is too short', () => {
    // Arrange
    const { signIn } = arrangeAuthState({ user: null });
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Act
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'short' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in \/ register/i }));

    // Assert
    expect(signIn).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Provider sign-in triggers correct provider identifier.
   *
   * Given: Signed-out user
   * When: Google provider button is clicked
   * Then: `signIn('google')` is called.
   *
   * Compliance note (auditability): Ensures provider selection is correct so downstream auth/audit logs are accurate.
   */
  it('initiates Google sign-in using provider identifier', () => {
    // Arrange
    const { signIn } = arrangeAuthState({ user: null });
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Act
    fireEvent.click(screen.getByText(/sign in with/i).closest('button') as HTMLButtonElement);

    // Assert
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith('google');
  });

  /**
   * Scenario: Provider sign-in triggers correct provider identifier.
   *
   * Given: Signed-out user
   * When: Apple provider button is clicked
   * Then: `signIn('apple')` is called.
   *
   * Compliance note (auditability): Ensures provider selection is correct so downstream auth/audit logs are accurate.
   */
  it('initiates Apple sign-in using provider identifier', () => {
    // Arrange
    const { signIn } = arrangeAuthState({ user: null });
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Act
    fireEvent.click(screen.getByText(/login with/i).closest('button') as HTMLButtonElement);

    // Assert
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith('apple');
  });

  /**
   * Scenario: Signed-in user sees logout only.
   *
   * Given: `user` is truthy
   * When: `SignInContent` is rendered
   * Then: Sign-in form and provider buttons are not present; logout is shown.
   *
   * Compliance note: Prevents presenting unnecessary authentication entry points to authenticated sessions.
   */
  it('hides sign-in options and renders logout when authenticated', () => {
    // Arrange
    arrangeAuthState({ user: { uid: 'test-user' } });

    // Act
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Assert
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /sign in \/ register/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /sign in with google/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /login with apple/i })
    ).not.toBeInTheDocument();
  });

  /**
   * Scenario: Logout triggers auth layer action.
   *
   * Given: Authenticated user
   * When: Logout is clicked
   * Then: `logout()` is called once.
   *
   * Compliance note: Ensures session termination wiring is correct, supporting security controls.
   */
  it('calls logout when logout button is clicked', () => {
    // Arrange
    const { logout } = arrangeAuthState({ user: { uid: 'test-user' } });
    const { SignInContent } = getComponents();
    render(<SignInContent />);

    // Act
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    // Assert
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

/**
 * SignIn: modal shell and close interactions.
 *
 * - Verifies the close callback is invoked via overlay and close icon button.
 * - Ensures modal is renderable in isolation (auth internals are mocked via `useFirebaseAuth`).
 */
describe('components/SignIn SignIn modal', () => {
  /**
   * Scenario: Overlay click closes modal.
   *
   * Given: A `close` callback is provided
   * When: User clicks the modal overlay
   * Then: `close` is invoked.
   *
   * Compliance note: Supports predictable UI dismissal to reduce abandonment risk and user frustration.
   */
  it('invokes close when overlay is clicked', () => {
    // Arrange
    arrangeAuthState({ user: null });
    const close = jest.fn();
    const { SignIn } = getComponents();
    const { container } = render(<SignIn close={close} />);
    const overlay = container.querySelector('div[role="presentation"]') ?? container.querySelector('div.z-40');

    // Act
    if (!overlay) {
      throw new Error('Expected modal overlay element to exist for close interaction.');
    }
    fireEvent.click(overlay);

    // Assert
    expect(close).toHaveBeenCalledTimes(1);
  });

  /**
   * Scenario: Close icon button closes modal.
   *
   * Given: A `close` callback is provided
   * When: User clicks the close icon button
   * Then: `close` is invoked.
   *
   * Compliance note: Ensures an explicit close affordance exists for accessibility/usability expectations.
   */
  it('invokes close when close icon button is clicked', () => {
    // Arrange
    arrangeAuthState({ user: null });
    const close = jest.fn();
    const { SignIn } = getComponents();
    const { container } = render(<SignIn close={close} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const closeButton = buttons.find((b) => b.className.includes('absolute right-[0] top-0'));

    // Act
    if (!closeButton) {
      throw new Error('Expected close icon button to exist for close interaction.');
    }
    fireEvent.click(closeButton);

    // Assert
    expect(close).toHaveBeenCalledTimes(1);
  });
});

/**
 * Guardrail: hook contract misuse throws an explicit error.
 *
 * - This test intentionally avoids mocking `useFirebaseAuth` and verifies the contract error message.
 * - External Firebase modules are mocked to prevent side effects during module import.
 */
describe('components/SignIn guardrails', () => {
  /**
   * Scenario: `useFirebaseAuth` used without provider throws explicit error.
   *
   * Given: `SignInContent` is rendered without `FirebaseAuthProvider`
   * When: The hook is evaluated
   * Then: An explicit error is thrown describing the provider requirement.
   *
   * Compliance note: Enforces correct architectural wiring to avoid undefined auth behavior in production.
   */
  it('throws a provider-requirement error when rendered without FirebaseAuthProvider (real hook)', () => {
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
