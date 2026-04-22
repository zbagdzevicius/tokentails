/** @jest-environment jsdom */

/**
 * BlessingsTable Unit Test Suite (Shelter Cats list wrapper)
 *
 * Business Domain / Responsibility
 * - Verifies `components/blessings/blessings-table.tsx`, a CMS list wrapper that renders:
 *   - A card header ("Shelter Cats") and description
 *   - A list of child marketplace entries (one per cat/blessing)
 *   - A footer summary ("Showing X of Y cats")
 *
 * Regulatory / Compliance Context (Accessibility)
 * - Validates user-visible content via accessible roles (e.g., heading) and readable text.
 *
 * Architecture Notes (Boundaries & Doubles)
 * - Child boundary: `components/blessings/MarketplaceItem.tsx` is mocked to keep this suite as unit tests
 *   focused on list wiring (mapping, prop forwarding, callback delegation).
 * - UI primitives (`@/components/ui/card`) are used as-is; tests assert only user-visible behavior.
 *
 * Test Data Strategy / Fixtures
 * - Uses minimal, synthetic `cats` fixtures shaped only by `_id`, because the unit maps items by key and
 *   forwards each object to the child component.
 * - Uses real `BlessingStatus` enum values for callback assertions to avoid string drift.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { BlessingsTable } from '@/components/blessings/blessings-table';
import { BlessingStatus } from '@/models/cats';

jest.mock('@/components/blessings/MarketplaceItem', () => ({
  MarketplaceItem: ({
    blessing,
    custom,
    onUpdateStatus,
  }: {
    blessing: { _id: string };
    custom?: boolean;
    onUpdateStatus: (id: string, status: BlessingStatus) => void;
  }) => (
    <article aria-label={`Marketplace item ${blessing._id}`}>
      <div>Id: {blessing._id}</div>
      <div>{custom ? 'Custom enabled' : 'Custom disabled'}</div>
      <button
        type="button"
        onClick={() => onUpdateStatus(blessing._id, BlessingStatus.WAITING)}
      >
        Trigger status update
      </button>
    </article>
  ),
}));

/**
 * BlessingsTable: rendering and list wiring.
 */
describe('components/blessings/BlessingsTable', () => {
  /**
   * Scenario: Basic context is visible to the user.
   *
   * Given: The table renders with any list of cats
   * When: The user views the header
   * Then: The heading and description are displayed.
   */
  it('renders the "Shelter Cats" header and description', () => {
    // Arrange / Act
    render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }] as any[]}
        totalBlessings={1}
        onUpdateStatus={jest.fn()}
      />
    );

    // Assert
    expect(
      screen.getByRole('heading', { name: /shelter cats/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/manage your cats and view their status/i)
    ).toBeInTheDocument();
  });

  /**
   * Scenario: List items map 1:1 to input cats.
   *
   * Given: A list of cats is provided
   * When: The table renders
   * Then: It renders one marketplace item per cat.
   */
  it('renders one marketplace item per cat', () => {
    // Arrange / Act
    render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }, { _id: 'cat-2' }, { _id: 'cat-3' }] as any[]}
        totalBlessings={3}
        onUpdateStatus={jest.fn()}
      />
    );

    // Assert
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText(/id: cat-1/i)).toBeInTheDocument();
    expect(screen.getByText(/id: cat-2/i)).toBeInTheDocument();
    expect(screen.getByText(/id: cat-3/i)).toBeInTheDocument();
  });

  /**
   * Scenario: Footer summary shows the visible list size and total.
   *
   * Given: Two cats are displayed and totalBlessings is 10
   * When: The table renders
   * Then: The footer shows "Showing 2 of 10 cats".
   */
  it('renders the footer summary using cats.length and totalBlessings', () => {
    // Arrange / Act
    render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }, { _id: 'cat-2' }] as any[]}
        totalBlessings={10}
        onUpdateStatus={jest.fn()}
      />
    );

    // Assert
    expect(screen.getByText(/showing/i)).toHaveTextContent(
      'Showing 2 of 10 cats'
    );
  });

  /**
   * Scenario: Empty list baseline.
   *
   * Given: No cats are available
   * When: The table renders
   * Then: No marketplace items are shown and the footer shows zero "showing" count.
   */
  it('renders zero items and still shows the footer summary when cats is empty', () => {
    // Arrange / Act
    render(
      <BlessingsTable
        cats={[]}
        totalBlessings={7}
        onUpdateStatus={jest.fn()}
      />
    );

    // Assert
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByText(/showing/i)).toHaveTextContent(
      'Showing 0 of 7 cats'
    );
  });

  /**
   * Scenario: Runtime-shaped props should not break rendering.
   *
   * Given: totalBlessings is undefined at runtime (despite TypeScript typing)
   * When: The table renders
   * Then: The footer falls back to showing 0 as the total.
   */
  it('falls back to 0 when totalBlessings is runtime-missing', () => {
    // Arrange / Act
    render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }] as any[]}
        totalBlessings={undefined as unknown as number}
        onUpdateStatus={jest.fn()}
      />
    );

    // Assert
    expect(screen.getByText(/showing/i)).toHaveTextContent('Showing 1 of 0 cats');
  });

  /**
   * Scenario: Custom workflow flag forwarding.
   *
   * Given: custom mode is enabled
   * When: The table renders marketplace items
   * Then: Each marketplace item receives the custom flag.
   */
  it('forwards the custom flag to each marketplace item', () => {
    // Arrange / Act
    render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }, { _id: 'cat-2' }] as any[]}
        totalBlessings={2}
        custom={true}
        onUpdateStatus={jest.fn()}
      />
    );

    // Assert
    expect(screen.getAllByText(/custom enabled/i)).toHaveLength(2);
  });

  /**
   * Scenario: Business-critical callback wiring to children.
   *
   * Given: The table renders a marketplace item with an update callback
   * When: The user triggers a status update from the child item
   * Then: The table's onUpdateStatus handler is invoked with the expected id and status.
   */
  it('delegates status updates from marketplace items to the provided handler', () => {
    // Arrange
    const onUpdateStatus = jest.fn();

    // Act
    render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }] as any[]}
        totalBlessings={1}
        onUpdateStatus={onUpdateStatus}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /trigger status update/i })
    );

    // Assert
    expect(onUpdateStatus).toHaveBeenCalledTimes(1);
    expect(onUpdateStatus).toHaveBeenCalledWith('cat-1', BlessingStatus.WAITING);
  });

  /**
   * Scenario: Prop-driven updates.
   *
   * Given: The list is refreshed from 1 item to 3 items
   * When: The component is re-rendered with new props
   * Then: Rendered marketplace items and footer counts update accordingly.
   */
  it('updates rendered items and footer counts when props change', () => {
    // Arrange
    const onUpdateStatus = jest.fn();

    // Act
    const { rerender } = render(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }] as any[]}
        totalBlessings={2}
        onUpdateStatus={onUpdateStatus}
      />
    );

    // Assert (initial render)
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText(/showing/i)).toHaveTextContent(
      'Showing 1 of 2 cats'
    );

    // Act (prop-driven refresh)
    rerender(
      <BlessingsTable
        cats={[{ _id: 'cat-1' }, { _id: 'cat-2' }, { _id: 'cat-3' }] as any[]}
        totalBlessings={10}
        onUpdateStatus={onUpdateStatus}
      />
    );

    // Assert (updated render)
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText(/showing/i)).toHaveTextContent(
      'Showing 3 of 10 cats'
    );
  });
});
