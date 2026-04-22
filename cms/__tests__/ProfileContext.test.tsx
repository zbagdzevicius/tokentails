/** @jest-environment jsdom */

/**
 * ProfileContext Unit Test Suite (Client-Side Profile State + Privacy-Safe Actions)
 *
 * Business Domain / Responsibility
 * - Verifies the unit responsibilities of `context/ProfileContext.tsx`, which owns:
 *   - In-memory `profile` state and partial profile updates (`setProfileUpdate`)
 *   - Injectable utilities state (`utils`) for UI integrations (open/share helpers)
 *   - The `copy(text)` helper which writes to the clipboard and emits user feedback via toast
 *   - Consumer hook contract guardrails (`useProfile` must be used within `ProfileProvider`)
 *   - UI gating intent via `showProfilePopup` (modal open attempt only when a profile exists)
 *
 * Regulatory / Compliance Context (GDPR / Security)
 * - GDPR / privacy-by-design: Tests prove that success feedback does not echo copied content, preventing
 *   accidental disclosure of tokens / invite links in UI messages or logs.
 * - Security / least data exposure: Tests ensure copy failures do not report false success and that errors
 *   do not include copied sensitive text in asserted messages.
 *
 * Architecture Notes (Boundaries & Doubles)
 * - UI feedback boundary: `useToast` from `context/ToastContext` is fully mocked.
 * - Browser boundary: `navigator.clipboard.writeText` is mocked (jsdom does not provide a reliable clipboard).
 * - Internal modal state is not exposed by `useProfile`; tests use minimal React instrumentation to prove the
 *   intended state transition via the internal `setIsProfileModalDisplayed` setter (auditability of gating).
 *
 * Test Data Strategy / Fixtures
 * - Uses minimal profile marker objects with clearly fake strings (no emails, no telegram IDs, no real PII).
 * - Uses a sensitive-looking clipboard payload (`invite://token-abc`) to validate non-leakage rules.
 *
 * Cross-References
 * - `context/ProfileContext.tsx` business rules:
 *   - `useProfile` throws "useProfile must be used within a ProfileProvider" when misused.
 *   - `setProfileUpdate` merges into `profile` only when a profile exists; otherwise it is a no-op.
 *   - `showProfilePopup` calls `setIsProfileModalDisplayed(true)` only when `profile` exists.
 *   - `copy` writes the supplied text to the clipboard and emits the fixed toast message:
 *     "Invite link is coppied to your clipboard" (note: current spelling preserved as contract evidence).
 */

import '@testing-library/jest-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

jest.mock('../context/ToastContext', () => ({
  useToast: jest.fn()
}));

const SENSITIVE_TEXT = 'invite://token-abc';
const TOAST_SUCCESS_MESSAGE = 'Invite link is coppied to your clipboard';

const getContextModule = () =>
  require('../context/ProfileContext') as typeof import('../context/ProfileContext');

const getMockUseToast = () => {
  const { useToast } =
    require('../context/ToastContext') as typeof import('../context/ToastContext');
  return useToast as unknown as jest.Mock;
};

const arrangeToast = () => {
  const toast = jest.fn();
  getMockUseToast().mockReturnValue(toast);
  return toast;
};

const setClipboardWriteText = (writeText: jest.Mock) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true
  });
  return writeText;
};

const createProfileFixture = (overrides?: Record<string, unknown>) => ({
  id: 'profile-1',
  name: 'Test User',
  role: 'user',
  ...overrides
});

type ProfileApi = ReturnType<
  (typeof import('../context/ProfileContext'))['useProfile']
>;

const createHarness = (onReady: (api: ProfileApi) => void) =>
  function Harness() {
    const { useProfile } = getContextModule();
    const api = useProfile();

    React.useEffect(() => {
      onReady(api);
    }, [api, onReady]);

    return null;
  };

const renderWithProvider = (onReady: (api: ProfileApi) => void) => {
  const { ProfileProvider } = getContextModule();
  const Harness = createHarness(onReady);
  return render(
    <ProfileProvider>
      <Harness />
    </ProfileProvider>
  );
};

const getLatestApi = (onReady: jest.Mock): ProfileApi => {
  const calls = onReady.mock.calls;
  if (!calls.length) {
    throw new Error('Expected ProfileContext Harness to provide a hook API.');
  }
  return calls[calls.length - 1][0] as ProfileApi;
};

const arrangeModalSetterCapture = () => {
  const originalUseState = React.useState;
  let useStateCallIndex = 0;
  const modalSetter = jest.fn();

  const spy = jest
    .spyOn(React, 'useState')
    .mockImplementation(((initialState: unknown) => {
      const result = originalUseState(initialState as never) as unknown as [
        unknown,
        (next: unknown) => void
      ];
      useStateCallIndex += 1;

      if (useStateCallIndex % 3 === 0) {
        return [result[0], modalSetter];
      }

      return result;
    }) as unknown as typeof React.useState);

  const getModalSetter = () => {
    return modalSetter;
  };

  return { getModalSetter, restore: () => spy.mockRestore() };
};

beforeEach(() => {
  jest.clearAllMocks();

  arrangeToast();
  setClipboardWriteText(jest.fn());
});

/**
 * ProfileProvider: profile/utils state management and modal gating intent.
 */
describe('context/ProfileContext ProfileProvider', () => {
  /**
   * Scenario: Default provider state establishes a stable consumer contract.
   *
   * Given: A component is wrapped in `ProfileProvider`
   * When: It calls `useProfile()` on initial render
   * Then: It receives `profile: null`, `utils: null`, and callable actions with no side effects.
   *
   * Compliance note: Establishing a deterministic default state helps prevent accidental data exposure by
   * ensuring no profile data is present until explicitly set.
   */
  it('exposes default profile/utils values and callable actions', async () => {
    // Arrange
    const toast = arrangeToast();
    const onReady = jest.fn();

    // Act
    renderWithProvider(onReady);

    // Assert
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const api = getLatestApi(onReady);

    expect(api.profile).toBeNull();
    expect(api.utils).toBeNull();
    expect(typeof api.setProfile).toBe('function');
    expect(typeof api.setProfileUpdate).toBe('function');
    expect(typeof api.setUtils).toBe('function');
    expect(typeof api.copy).toBe('function');
    expect(typeof api.showProfilePopup).toBe('function');
    expect(toast).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Setting a profile propagates state to consumers.
   *
   * Given: A consumer captures the hook API inside the provider
   * When: `setProfile(profileObject)` is invoked
   * Then: Subsequent renders expose the new profile through `useProfile().profile`.
   */
  it('propagates setProfile updates to consumers', async () => {
    // Arrange
    const onReady = jest.fn();
    const profile = createProfileFixture({ name: 'New Name' });
    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    // Act
    await act(async () => {
      getLatestApi(onReady).setProfile(profile as any);
    });

    // Assert
    await waitFor(() => expect(getLatestApi(onReady).profile).toEqual(profile));
  });

  /**
   * Scenario: Partial updates merge deterministically into the latest profile state.
   *
   * Given: A provider with an existing profile
   * When: `setProfileUpdate` is called multiple times with different fields
   * Then: The final profile contains all updates while preserving unchanged fields.
   *
   * Compliance note: Uses minimal fixture data and avoids introducing real PII while proving deterministic state
   * handling for user-driven profile edits.
   */
  it('merges partial updates into the latest profile without dropping unchanged fields', async () => {
    // Arrange
    const onReady = jest.fn();
    const initialProfile = createProfileFixture({
      name: 'Original',
      role: 'user',
      locale: 'en'
    });
    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    await act(async () => {
      getLatestApi(onReady).setProfile(initialProfile as any);
    });
    await waitFor(() =>
      expect(getLatestApi(onReady).profile).toEqual(initialProfile)
    );

    // Act
    await act(async () => {
      getLatestApi(onReady).setProfileUpdate({ name: 'Updated' } as any);
    });
    await waitFor(() =>
      expect(getLatestApi(onReady).profile).toEqual({
        ...initialProfile,
        name: 'Updated'
      })
    );

    await act(async () => {
      getLatestApi(onReady).setProfileUpdate({ locale: 'lt' } as any);
    });

    // Assert
    await waitFor(() =>
      expect(getLatestApi(onReady).profile).toEqual({
        ...initialProfile,
        name: 'Updated',
        locale: 'lt'
      })
    );
  });

  /**
   * Scenario: Utility injection is visible to consumers.
   *
   * Given: A consumer inside the provider
   * When: `setUtils(utilsObject)` is called
   * Then: Subsequent renders expose the injected object via `useProfile().utils`.
   */
  it('propagates setUtils updates to consumers', async () => {
    // Arrange
    const onReady = jest.fn();
    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const utils = {
      openLink: jest.fn(),
      openTelegramLink: jest.fn(),
      shareURL: jest.fn()
    };

    // Act
    await act(async () => {
      getLatestApi(onReady).setUtils(utils as any);
    });

    // Assert
    await waitFor(() => expect(getLatestApi(onReady).utils).toBe(utils));
  });

  /**
   * Scenario: Clipboard copy succeeds and produces a privacy-safe user feedback toast.
   *
   * Given: `navigator.clipboard.writeText` resolves successfully
   * When: `copy(sensitiveText)` is invoked
   * Then: Clipboard receives the exact string and a toast is emitted with the fixed success message only.
   *
   * Compliance note (GDPR / privacy-by-design): Proves that copied text (which may be a secret/invite token) is
   * not included in the toast payload.
   */
  it('writes to clipboard and shows a success toast without leaking copied content', async () => {
    // Arrange
    const toast = arrangeToast();
    const onReady = jest.fn();
    const writeText = setClipboardWriteText(jest.fn().mockResolvedValue(undefined));
    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    // Act
    act(() => {
      getLatestApi(onReady).copy(SENSITIVE_TEXT);
    });

    // Assert
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(SENSITIVE_TEXT);

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith({ message: TOAST_SUCCESS_MESSAGE });
    expect(JSON.stringify(toast.mock.calls[0][0])).not.toContain(SENSITIVE_TEXT);
  });

  /**
   * Scenario: Partial profile updates are a no-op when no profile exists.
   *
   * Given: Provider default state (`profile: null`)
   * When: `setProfileUpdate` is invoked
   * Then: `profile` remains `null`.
   *
   * Compliance note: Prevents accidental creation of partial profile data without an explicit profile baseline.
   */
  it('does not apply setProfileUpdate when profile is null', async () => {
    // Arrange
    const onReady = jest.fn();
    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(getLatestApi(onReady).profile).toBeNull();

    // Act
    await act(async () => {
      getLatestApi(onReady).setProfileUpdate({ name: 'Ignored' } as any);
    });

    // Assert
    expect(getLatestApi(onReady).profile).toBeNull();
  });

  /**
   * Scenario: Profile can be cleared after being set.
   *
   * Given: An existing profile
   * When: `setProfile(null)` is called
   * Then: Consumers observe `profile: null`.
   *
   * Compliance note (GDPR): Clearing profile supports sign-out and data minimization by removing derived state.
   */
  it('clears profile state when setProfile(null) is invoked', async () => {
    // Arrange
    const onReady = jest.fn();
    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const profile = createProfileFixture({ name: 'To Clear' });

    await act(async () => {
      getLatestApi(onReady).setProfile(profile as any);
    });
    await waitFor(() =>
      expect(getLatestApi(onReady).profile).toEqual(profile)
    );

    // Act
    await act(async () => {
      getLatestApi(onReady).setProfile(null);
    });

    // Assert
    await waitFor(() => expect(getLatestApi(onReady).profile).toBeNull());
  });

  /**
   * Scenario: showProfilePopup does not attempt to open the modal when no profile exists.
   *
   * Given: `profile: null`
   * When: `showProfilePopup()` is invoked
   * Then: The internal modal setter is not called.
   *
   * Interaction rationale: The modal state is intentionally not exposed by the hook; capturing the internal
   * setter is required to prove the gating behavior without introducing integration/UI tests.
   */
  it('does not open the profile modal when no profile exists', async () => {
    // Arrange
    const onReady = jest.fn();
    const { getModalSetter, restore } = arrangeModalSetterCapture();
    try {
      renderWithProvider(onReady);
      await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

      // Act
      act(() => {
        getLatestApi(onReady).showProfilePopup();
      });

      // Assert
      expect(getModalSetter()).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  /**
   * Scenario: showProfilePopup attempts to open the modal when a profile exists.
   *
   * Given: An existing profile in context
   * When: `showProfilePopup()` is invoked
   * Then: The internal modal setter is called with `true`.
   *
   * Interaction rationale: The setter call is the observable unit boundary for this behavior; no UI is rendered
   * by this module, so this is the minimal unit-level evidence.
   */
  it('opens the profile modal when a profile exists', async () => {
    // Arrange
    const onReady = jest.fn();
    const { getModalSetter, restore } = arrangeModalSetterCapture();
    try {
      renderWithProvider(onReady);
      await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

      await act(async () => {
        getLatestApi(onReady).setProfile(createProfileFixture() as any);
      });
      await waitFor(() => expect(getLatestApi(onReady).profile).not.toBeNull());

      // Act
      act(() => {
        getLatestApi(onReady).showProfilePopup();
      });

      // Assert
      expect(getModalSetter()).toHaveBeenCalledTimes(1);
      expect(getModalSetter()).toHaveBeenCalledWith(true);
    } finally {
      restore();
    }
  });
});

/**
 * useProfile: consumer hook guardrails and error handling for external boundaries.
 */
describe('context/ProfileContext useProfile', () => {
  /**
   * Scenario: Hook is used outside the provider.
   *
   * Given: A component calls `useProfile` without a surrounding `ProfileProvider`
   * When: It renders
   * Then: It throws the exact provider-requirement error message for developer ergonomics.
   */
  it('throws a clear provider error when used outside ProfileProvider', () => {
    // Arrange
    const { useProfile } = jest.requireActual(
      '../context/ProfileContext'
    ) as typeof import('../context/ProfileContext');

    const MisuseHarness = () => {
      useProfile();
      return null;
    };

    // Act / Assert
    expect(() => render(<MisuseHarness />)).toThrow(
      'useProfile must be used within a ProfileProvider'
    );
  });

  /**
   * Scenario: Clipboard promise rejection should not show success feedback and should surface a failure signal.
   *
   * Given: `navigator.clipboard.writeText` rejects
   * When: `copy(text)` is invoked
   * Then: No success toast is emitted, and the failure is observable via a captured thrown error.
   *
   * Compliance note: Proves the success message is not emitted on failure, reducing the risk of misleading UI
   * behavior around actions that may involve sensitive invite links.
   */
  it('does not emit a success toast when clipboard writeText rejects and surfaces the failure', async () => {
    // Arrange
    const toast = arrangeToast();
    const onReady = jest.fn();
    const injectedError = new Error('clipboard failure');
    let capturedThrown: unknown = null;

    const rejectionObserved = new Promise<void>((resolve) => {
      const thenable: any = {
        then: () => thenable,
        catch: (onRejected: (err: unknown) => void) => {
          queueMicrotask(() => {
            try {
              onRejected(injectedError);
            } catch (err) {
              capturedThrown = err;
            } finally {
              resolve();
            }
          });
          return thenable;
        }
      };
      setClipboardWriteText(jest.fn(() => thenable));
    });

    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    // Act
    act(() => {
      getLatestApi(onReady).copy(SENSITIVE_TEXT);
    });
    await rejectionObserved;

    // Assert
    expect(toast).not.toHaveBeenCalled();
    expect(capturedThrown).toBe(injectedError);
    expect(String((capturedThrown as any)?.message ?? capturedThrown)).not.toContain(
      SENSITIVE_TEXT
    );
  });

  /**
   * Scenario: Clipboard API throws synchronously.
   *
   * Given: `navigator.clipboard.writeText` throws synchronously (unsupported/permission error)
   * When: `copy(text)` is invoked
   * Then: The error is thrown and no success toast is emitted.
   *
   * Compliance note: Prevents false success feedback when clipboard operations are blocked by the environment.
   */
  it('throws synchronously when clipboard writeText throws and does not emit a success toast', async () => {
    // Arrange
    const toast = arrangeToast();
    const onReady = jest.fn();
    const injectedError = new Error('clipboard unsupported');
    setClipboardWriteText(
      jest.fn(() => {
        throw injectedError;
      })
    );

    renderWithProvider(onReady);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    // Act / Assert
    expect(() => getLatestApi(onReady).copy(SENSITIVE_TEXT)).toThrow(injectedError);
    expect(toast).not.toHaveBeenCalled();
  });
});
