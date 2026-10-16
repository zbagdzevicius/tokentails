/** @jest-environment jsdom */

/**
 * Bet #3 AI spend view (launch item YC-L8): GET /yourcat/stats with the lowercase `accesstoken`
 * header, and a 14-day table with the cap, spend, committed amount and the counters.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import {
  fetchYourcatStats,
  IYourcatStatsDay,
  REFUSAL_COUNTERS,
  statsColumns,
  YourcatStatsTable
} from '@/pages/yourcat';

const day = (fields: Partial<IYourcatStatsDay> = {}): IYourcatStatsDay => ({
  day: '2026-10-11',
  capEur: 5,
  spentEur: 1.234,
  committedEur: 1.5,
  counts: { refusedIpCap: 4, previewsDone: 2 },
  ...fields
});

const realFetch = global.fetch;

describe('fetchYourcatStats', () => {
  afterEach(() => {
    sessionStorage.clear();
    global.fetch = realFetch;
  });

  it('calls GET /yourcat/stats?days=14 with the lowercase accesstoken header', async () => {
    sessionStorage.setItem('accesstoken', 'fbtoken');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ days: [day()] })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const days = await fetchYourcatStats();

    expect(days).toEqual([day()]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/yourcat\/stats\?days=14$/);
    expect(init.method).toBe('GET');
    expect(init.headers.accesstoken).toBe('fbtoken');
  });
});

describe('YourcatStatsTable', () => {
  it('always shows the refusal counters first, then the other counters', () => {
    expect(statsColumns([day(), day({ day: '2026-10-10', counts: { costAlerts: 1 } })])).toEqual([
      ...REFUSAL_COUNTERS,
      'previewsDone',
      'costAlerts'
    ]);
  });

  it('renders one row per day with euros and zero for a missing counter', () => {
    render(<YourcatStatsTable days={[day()]} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    const cells = within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells.slice(0, 4)).toEqual(['2026-10-11', '€5.00', '€1.23', '€1.50']);
    // refusedNoClientIp, refusedAppCheck, refusedIpCap, ...
    expect(cells.slice(4, 7)).toEqual(['0', '0', '4']);
  });

  it('says when there is no data or no admin access', () => {
    const { rerender } = render(<YourcatStatsTable isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    rerender(<YourcatStatsTable days={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('admin account (role 5)');
    rerender(<YourcatStatsTable days={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No AI activity');
  });
});
