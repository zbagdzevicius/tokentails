/** @jest-environment jsdom */

/**
 * MarketplaceItem Unit Test Suite (Blessings Marketplace Card)
 *
 * Business Domain / Responsibility
 * - Verifies `components/blessings/MarketplaceItem.tsx`, a CMS marketplace list item for a blessing’s cat.
 * - The unit under test is responsible for:
 *   - Rendering a navigable card (Next.js `Link`) for a blessing
 *   - Displaying cat identity (name, avatar) and workflow status label
 *   - Providing a “Show Card” action that toggles a preview modal
 *   - Providing an “UPDATE STATUS” dropdown to move the blessing through workflow statuses
 *
 * Regulatory / Compliance Context (Accessibility)
 * - Tests validate accessible affordances via roles and labels:
 *   - Link presence for navigation
 *   - Button affordances for modal and status updates
 *   - Image alt text for meaningful visual content
 *
 * Architecture Notes (Boundaries & Doubles)
 * - Navigation boundary: `next/link` is mocked to a plain anchor to make `href` assertions deterministic.
 * - Modal boundary: `components/tailsCard/TailsCardModal` is mocked to avoid portal/layout complexity.
 * - Radix UI (dropdown): Environment shims match `__tests__/components/ui/dropdown-menu.test.tsx` to keep
 *   keyboard activation reliable under JSDOM.
 * - Icon assets: `lucide-react` icons are mocked to isolate visuals.
 *
 * Test Data Strategy / Fixtures
 * - Uses explicit, synthetic ids and URLs (e.g., `blessing-1`, `https://example.test/...`) to keep tests stable.
 * - Uses minimal domain-shaped fixtures; where runtime behavior allows optional fields, tests document any
 *   intentional “runtime-shaped” casting for negative/edge scenarios.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { MarketplaceItem } from '@/components/blessings/MarketplaceItem';
import { cardsColor, type ICat as MarketplaceCat } from '@/models/cat';
import { BlessingStatus, BlessingStatuses, CatAbilityType } from '@/models/cats';
import { type IBlessing, Status } from '@/models/blessing';
import type { IImage } from '@/models/image';

const originalConsoleError = console.error;
let consoleErrorSpy: jest.SpyInstance;

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname?: string };
    children: React.ReactNode;
  }) => (
    <a href={typeof href === 'string' ? href : (href.pathname ?? '')} {...props}>
      {children}
    </a>
  )
}));

jest.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon">CheckIcon</span>,
  ChevronRight: () => <span data-testid="chevron-right-icon">ChevronRightIcon</span>,
  Circle: () => <span data-testid="circle-icon">CircleIcon</span>,
}));

jest.mock('../../../components/tailsCard/TailsCardModal', () => ({
  TailsCardModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Tails card modal">
      <button type="button" onClick={onClose}>
        Close modal
      </button>
    </div>
  )
}));

// Mock ResizeObserver for Radix UI positioning in JSDOM
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Pointer Capture methods (harmless but needed for Radix)
window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.HTMLElement.prototype.releasePointerCapture = jest.fn();
window.HTMLElement.prototype.hasPointerCapture = jest.fn();

beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const [message] = args;
      const messageText = typeof message === 'string' ? message : '';

      // MarketplaceItem currently nests a Button inside a Radix Trigger button; suppress the expected
      // validateDOMNesting warning so tests remain signal-rich (other console errors are preserved).
      if (
        messageText.includes('cannot be a descendant of') ||
        messageText.includes('cannot contain a nested')
      ) {
        return;
      }

      originalConsoleError(...(args as Parameters<typeof originalConsoleError>));
    });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

const createImageFixture = (overrides?: Partial<IImage>): IImage => ({
  _id: 'image-1',
  url: 'https://example.test/image.webp',
  name: 'Example Image',
  ...overrides
});

const createPreviewBlessingFixture = (
  overrides?: Partial<IBlessing>
): IBlessing => {
  return {
    _id: 'preview-blessing-1',
    name: 'Preview Blessing',
    description: 'Preview description',
    image: createImageFixture({
      _id: 'preview-image-1',
      url: 'https://example.test/fallback.webp',
      name: 'Fallback Image'
    }),
    savior: createImageFixture({
      _id: 'preview-savior-1',
      url: 'https://example.test/savior.webp',
      name: 'Savior Image'
    }),
    ...overrides
  } as IBlessing;
};

const createCatFixture = (overrides?: Partial<MarketplaceCat>): MarketplaceCat => {
  return {
    _id: 'cat-1',
    name: 'Test Cat',
    type: CatAbilityType.FIRE,
    blessings: [createPreviewBlessingFixture()],
    isBlueprint: false,
    resqueStory: 'A synthetic rescue story.',
    spriteImg: 'https://example.test/sprite.webp',
    catImg: 'https://example.test/cat.webp',
    cardImg: 'https://example.test/card.webp',
    ...overrides
  };
};

const createBlessingFixture = (overrides?: Partial<IBlessing>): IBlessing => {
  const cat = (overrides?.cat as MarketplaceCat | undefined) ?? createCatFixture();

  return {
    _id: 'blessing-1',
    name: 'Blessing Name',
    description: 'Blessing description',
    image: createImageFixture({
      _id: 'blessing-image-1',
      url: 'https://example.test/blessing.webp',
      name: 'Blessing Image'
    }),
    savior: createImageFixture({
      _id: 'blessing-savior-1',
      url: 'https://example.test/blessing-savior.webp',
      name: 'Blessing Savior'
    }),
    cat,
    status: Status.WAITING,
    ...overrides
  };
};

const getUpdateStatusTriggerButton = () => {
  const candidates = screen.getAllByRole('button', { name: /update status/i });
  const trigger = candidates.find(
    (button) => button.getAttribute('aria-haspopup') === 'true'
  );

  if (!trigger) {
    throw new Error(
      'Expected an "UPDATE STATUS" trigger button with aria-haspopup="true".'
    );
  }

  return trigger;
};

/**
 * MarketplaceItem: rendering guardrails and user-visible content.
 */
describe('components/blessings/MarketplaceItem', () => {
  /**
   * Scenario: Defensive rendering when upstream data is absent.
   *
   * Given: No `blessing` prop is provided
   * When: The component is rendered
   * Then: It renders nothing (null) and does not crash.
   */
  it('renders nothing when blessing is missing', () => {
    // Arrange
    const onUpdateStatus = jest.fn();

    // Act
    const { container } = render(<MarketplaceItem onUpdateStatus={onUpdateStatus} />);

    // Assert
    expect(container.firstChild).toBeNull();
    expect(onUpdateStatus).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Defensive rendering when a blessing lacks a cat record.
   *
   * Given: A blessing object without a `cat`
   * When: The component is rendered
   * Then: It renders nothing (null) and does not crash.
   */
  it('renders nothing when blessing.cat is missing', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const blessingWithoutCat = {
      ...createBlessingFixture(),
      cat: undefined
    } as unknown as IBlessing;

    // Act
    const { container } = render(
      <MarketplaceItem blessing={blessingWithoutCat} onUpdateStatus={onUpdateStatus} />
    );

    // Assert
    expect(container.firstChild).toBeNull();
    expect(onUpdateStatus).not.toHaveBeenCalled();
  });

  /**
   * Scenario: Default navigation routes to blessings details.
   *
   * Given: A rendered MarketplaceItem with `custom` unset/false
   * When: The user inspects the card link
   * Then: It points to `/blessings/:id`.
   */
  it('links to /blessings/:id by default', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const blessing = createBlessingFixture({ _id: 'blessing-1' });

    // Act
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Assert
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/blessings/blessing-1');
  });

  /**
   * Scenario: Custom workflow routes to individual blessing details.
   *
   * Given: A rendered MarketplaceItem with `custom={true}`
   * When: The user inspects the card link
   * Then: It points to `/individual/:id`.
   */
  it('links to /individual/:id when custom is enabled', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const blessing = createBlessingFixture({ _id: 'blessing-1' });

    // Act
    render(
      <MarketplaceItem blessing={blessing} custom={true} onUpdateStatus={onUpdateStatus} />
    );

    // Assert
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/individual/blessing-1');
  });

  /**
   * Scenario: Status label reflects the current workflow state.
   *
   * Given: A blessing with `status = WAITING`
   * When: The component is rendered
   * Then: The user sees the status label `WAITING`.
   */
  it('displays the current blessing status when present', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const blessing = createBlessingFixture({ status: Status.WAITING });

    // Act
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Assert
    expect(screen.getByText('WAITING')).toBeInTheDocument();
  });

  /**
   * Scenario: Missing status data falls back to a safe label.
   *
   * Given: A blessing without a status value
   * When: The component is rendered
   * Then: The user sees the status label `UNKNOWN`.
   */
  it('displays UNKNOWN when blessing status is not set', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const blessing = createBlessingFixture({ status: undefined });

    // Act
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Assert
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });

  /**
   * Scenario: Card styling uses the cat ability color mapping.
   *
   * Given: A cat with a known `type`
   * When: The component renders
   * Then: The card border and ribbons use `cardsColor[type]`.
   */
  it('applies cardsColor mapping to border and ribbons', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const cat = createCatFixture({ type: CatAbilityType.FIRE });
    const blessing = createBlessingFixture({ cat, status: Status.WAITING });

    // Act
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Assert
    const expectedColor = cardsColor[cat.type];
    const link = screen.getByRole('link');
    expect(link).toHaveStyle({ borderColor: expectedColor });

    expect(screen.getByText(cat.name)).toHaveStyle({ background: expectedColor });
    expect(screen.getByText('WAITING')).toHaveStyle({ background: expectedColor });
  });

  /**
   * Scenario: Cat avatar image provides meaningful alt text and stable src.
   *
   * Given: A rendered MarketplaceItem with a cat image URL and name
   * When: The user or assistive technology reads the images
   * Then: The avatar image uses `alt={cat.name}` and `src={cat.catImg}`.
   */
  it('renders the cat avatar image with correct alt and src', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const cat = createCatFixture({
      name: 'Pixel Cat',
      catImg: 'https://example.test/pixel-cat.webp'
    });
    const blessing = createBlessingFixture({ cat });

    // Act
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Assert
    const avatar = screen.getByRole('img', { name: 'Pixel Cat' });
    expect(avatar).toHaveAttribute('src', 'https://example.test/pixel-cat.webp');
    expect(avatar).toHaveAttribute('draggable', 'false');
  });

  /**
   * Scenario: Blessing preview image prefers blessing.image.url when available.
   *
   * Given: A blessing with `image.url` and a cat that also has blessing images
   * When: The component is rendered
   * Then: The preview image uses the blessing image URL.
   */
  it('prefers blessing image URL for the preview image', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const cat = createCatFixture({
      blessings: [
        createPreviewBlessingFixture({
          image: createImageFixture({
            _id: 'cat-fallback-image-1',
            url: 'https://example.test/cat-fallback.webp',
            name: 'Cat Fallback'
          })
        })
      ]
    });
    const blessing = createBlessingFixture({
      cat,
      image: createImageFixture({
        _id: 'blessing-image-2',
        url: 'https://example.test/blessing-preferred.webp',
        name: 'Blessing Preferred'
      })
    });

    // Act
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Assert
    const preview = screen.getByRole('img', { name: `${cat.type} icon` });
    expect(preview).toHaveAttribute('src', 'https://example.test/blessing-preferred.webp');
  });

  /**
   * Scenario: Blessing preview image falls back to the cat’s first blessing image when blessing image is absent.
   *
   * Given: A runtime-shaped blessing object where `image` is missing and the cat has a first blessing image
   * When: The component is rendered
   * Then: The preview image uses the cat’s first blessing image URL.
   */
  it('falls back to cat.blessings[0].image.url when blessing image is missing at runtime', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const cat = createCatFixture({
      blessings: [
        createPreviewBlessingFixture({
          image: createImageFixture({
            _id: 'cat-image-1',
            url: 'https://example.test/cat-first.webp',
            name: 'Cat First'
          })
        })
      ]
    });

    const blessingWithoutImage = {
      ...createBlessingFixture({ cat }),
      image: undefined
    } as unknown as IBlessing;

    // Act
    render(
      <MarketplaceItem blessing={blessingWithoutImage} onUpdateStatus={onUpdateStatus} />
    );

    // Assert
    const preview = screen.getByRole('img', { name: `${cat.type} icon` });
    expect(preview).toHaveAttribute('src', 'https://example.test/cat-first.webp');
  });

  /**
   * Scenario: User opens and closes the card preview modal.
   *
   * Given: A rendered MarketplaceItem
   * When: The user clicks “Show Card” and then closes the modal
   * Then: The modal appears and is removed after closing.
   */
  it('toggles the preview modal via Show Card and modal onClose', () => {
    // Arrange
    const onUpdateStatus = jest.fn();
    const blessing = createBlessingFixture();
    render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

    // Act (open)
    fireEvent.click(screen.getByRole('button', { name: /show card/i }));

    // Assert (open)
    expect(
      screen.getByRole('dialog', { name: /tails card modal/i })
    ).toBeInTheDocument();

    // Act (close)
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));

    // Assert (closed)
    expect(
      screen.queryByRole('dialog', { name: /tails card modal/i })
    ).not.toBeInTheDocument();
  });

  /**
   * MarketplaceItem: Status dropdown behavior and callback wiring.
   */
  describe('Status dropdown', () => {
    /**
     * Scenario: User opens the status dropdown using the keyboard.
     *
     * Given: A rendered MarketplaceItem
     * When: The user presses Enter on the “UPDATE STATUS” trigger
     * Then: The menu label and at least one status option become visible.
     */
    it('opens the status dropdown via keyboard activation', async () => {
      // Arrange
      const onUpdateStatus = jest.fn();
      const blessing = createBlessingFixture();
      render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

      // Act
      const trigger = getUpdateStatusTriggerButton();
      fireEvent.keyDown(trigger, { key: 'Enter' });

      // Assert
      expect(
        await screen.findByText(/select new status/i)
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('menuitem', { name: BlessingStatuses[0] })
      ).toBeInTheDocument();
    });

    /**
     * Scenario: User updates the blessing status from the dropdown menu.
     *
     * Given: A rendered MarketplaceItem with an `onUpdateStatus` callback
     * When: The user opens the menu and selects a new status
     * Then: `onUpdateStatus(blessingId, selectedStatus)` is called once.
     */
    it('invokes onUpdateStatus with blessing id and selected status', async () => {
      // Arrange
      const onUpdateStatus = jest.fn();
      const blessing = createBlessingFixture({ _id: 'blessing-1', status: Status.WAITING });
      render(<MarketplaceItem blessing={blessing} onUpdateStatus={onUpdateStatus} />);

      // Act
      const trigger = getUpdateStatusTriggerButton();
      fireEvent.keyDown(trigger, { key: 'Enter' });

      const adoptedItem = await screen.findByRole('menuitem', {
        name: BlessingStatus.ADOPTED
      });
      fireEvent.click(adoptedItem);

      // Assert
      expect(onUpdateStatus).toHaveBeenCalledTimes(1);
      expect(onUpdateStatus).toHaveBeenCalledWith('blessing-1', BlessingStatus.ADOPTED);
    });
  });
});
