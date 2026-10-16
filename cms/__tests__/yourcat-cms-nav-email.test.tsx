/** @jest-environment jsdom */

/**
 * Bet #3 CMS follow-ups: the /yourcat stats page has a nav link (CR1-06), and the table shows the
 * failed portrait email counter as its own last column (KI-11, `portraitsEmailFailed`).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
  EMAIL_FAILED_COUNTER,
  IYourcatStatsDay,
  REFUSAL_COUNTERS,
  statsColumns,
  YourcatStatsTable
} from '@/pages/yourcat';

jest.mock('next/navigation', () => ({ usePathname: () => '/yourcat' }));
jest.mock('@/components/users/user', () => ({ User: () => null }));

const DashboardLayout = require('@/layout/pageLayout').default;

const day = (counts: IYourcatStatsDay['counts']): IYourcatStatsDay => ({
  day: '2026-10-11',
  capEur: 5,
  spentEur: 1,
  committedEur: 1,
  counts
});

describe('CMS nav', () => {
  it('links to the /yourcat stats page', () => {
    render(
      <DashboardLayout>
        <p>content</p>
      </DashboardLayout>
    );
    const link = screen.getByText('YourCat').closest('a');
    expect(link).toHaveAttribute('href', '/yourcat');
  });
});

describe('portraitsEmailFailed column', () => {
  it('is not one of the generic counter columns', () => {
    expect(
      statsColumns([day({ portraitsEmailFailed: 2, portraitsDelivered: 1 })])
    ).toEqual([...REFUSAL_COUNTERS, 'portraitsDelivered']);
  });

  it('is the last column, with 0 on a day without failures and the count otherwise', () => {
    render(
      <YourcatStatsTable
        days={[
          day({ portraitsEmailFailed: 2 }),
          { ...day({}), day: '2026-10-10' }
        ]}
      />
    );
    const headers = screen.getAllByRole('columnheader');
    expect(headers[headers.length - 1]).toHaveTextContent(EMAIL_FAILED_COUNTER);
    const rows = screen.getAllByRole('row');
    const last = (row: HTMLElement) => {
      const cells = within(row).getAllByRole('cell');
      return cells[cells.length - 1];
    };
    expect(last(rows[1])).toHaveTextContent('2');
    expect(last(rows[1])).toHaveClass('text-destructive');
    expect(last(rows[2])).toHaveTextContent('0');
    expect(last(rows[2])).not.toHaveClass('text-destructive');
  });
});
