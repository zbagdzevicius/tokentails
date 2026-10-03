/** @jest-environment jsdom */

/**
 * Cat name reports (plan G3, App Store guideline 1.2): the CMS moderation queue.
 *
 * - NameReportCard shows what was reported and why, validates a replacement name with the shared
 *   `normalizeCatName` (the same check the backend runs), and calls the three actions.
 * - NameReportsList shows an empty state per status.
 * - NAME_REPORTS_API builds the backend routes with the lowercase `accesstoken` header.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NameReportCard } from '@/components/name-reports/name-report-card';
import { NameReportsList } from '@/components/name-reports/name-reports-list';
import type { INameReportGroup } from '@/api/name-reports-api';

const group = (fields: Partial<INameReportGroup> = {}): INameReportGroup => ({
  cat: { _id: 'cat-1', name: 'Rudeboy', starterBreed: 'MISTY', catImg: 'https://cdn/cat.gif' },
  status: 'open',
  count: 3,
  reasons: { offensive: 2, impersonation: 1 },
  names: ['Rudeboy', 'Rudeb0y'],
  notes: ['not nice'],
  lastAt: '2026-09-30T10:00:00.000Z',
  ...fields
});

describe('NameReportCard', () => {
  it('shows the cat, the report count, reasons, names and notes', () => {
    render(<NameReportCard group={group()} onModerate={jest.fn()} />);

    expect(screen.getByText('Rudeboy')).toBeInTheDocument();
    expect(screen.getByLabelText('3 reports')).toBeInTheDocument();
    expect(screen.getByText('Offensive × 2')).toBeInTheDocument();
    expect(screen.getByText('Impersonation × 1')).toBeInTheDocument();
    expect(screen.getByText('Rudeboy, Rudeb0y')).toBeInTheDocument();
    expect(screen.getByText('“not nice”')).toBeInTheDocument();
    expect(screen.getByText(/Misty starter/)).toBeInTheDocument();
  });

  it('validates the replacement name with the shared rules before enabling Rename', async () => {
    const onModerate = jest.fn().mockResolvedValue(true);
    render(<NameReportCard group={group()} onModerate={onModerate} />);
    const input = screen.getByLabelText('New name');
    const rename = screen.getByRole('button', { name: 'Rename' });

    expect(rename).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Sh1t' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a kinder name.');
    expect(rename).toBeDisabled();
    fireEvent.change(input, { target: { value: 'аdmin' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use letters, numbers');

    fireEvent.change(input, { target: { value: '  O’Malley ' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(rename);
    });
    expect(onModerate).toHaveBeenCalledWith('rename', "O'Malley");
    expect(input).toHaveValue('');
  });

  it('resets and dismisses', async () => {
    const onModerate = jest.fn().mockResolvedValue(true);
    render(<NameReportCard group={group()} onModerate={onModerate} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset name' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    });
    expect(onModerate.mock.calls).toEqual([
      ['reset', undefined],
      ['dismiss', undefined]
    ]);
  });

  it('has no actions on resolved reports, and says what was done', () => {
    const { rerender } = render(
      <NameReportCard
        group={group({ status: 'actioned', action: 'reset', resolvedAt: '2026-10-01T00:00:00.000Z' })}
        onModerate={jest.fn()}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Reset to breed name on 2026-10-01')).toBeInTheDocument();

    rerender(
      <NameReportCard
        group={group({ status: 'dismissed', action: 'dismiss', cat: { _id: 'gone', missing: true } })}
        onModerate={jest.fn()}
      />
    );
    expect(screen.getByText('Cat deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers only Dismiss on the open reports of a deleted cat', async () => {
    const onModerate = jest.fn().mockResolvedValue(true);
    render(<NameReportCard group={group({ cat: { _id: 'gone', missing: true } })} onModerate={onModerate} />);

    expect(screen.getByText('Cat deleted')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Dismiss']);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    });
    expect(onModerate).toHaveBeenCalledWith('dismiss', undefined);
  });
});

describe('NameReportsList', () => {
  it('shows loading and per-status empty states', () => {
    const { rerender } = render(<NameReportsList status="open" isLoading onModerate={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    rerender(<NameReportsList status="open" groups={[]} onModerate={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('No open name reports');
    rerender(<NameReportsList status="dismissed" groups={null} onModerate={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('No reports have been dismissed');
  });

  it('passes the group to the moderation handler', async () => {
    const onModerate = jest.fn().mockResolvedValue(true);
    render(<NameReportsList status="open" groups={[group()]} onModerate={onModerate} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    });
    expect(onModerate).toHaveBeenCalledWith(expect.objectContaining({ cat: expect.objectContaining({ _id: 'cat-1' }) }), 'dismiss', undefined);
  });
});

describe('NAME_REPORTS_API', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    jest.resetModules();
    fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => '[]' });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    sessionStorage.setItem('accesstoken', 'fbTOKEN');
    process.env.NEXT_PUBLIC_BE_URL = 'https://api.test';
  });

  it('lists and moderates through the backend routes with the accesstoken header', async () => {
    const { NAME_REPORTS_API } = require('@/api/name-reports-api') as typeof import('@/api/name-reports-api');

    await NAME_REPORTS_API.list('open', 2);
    await NAME_REPORTS_API.moderate('cat 1', 'rename', 'Pebble');
    await NAME_REPORTS_API.moderate('cat-2', 'reset', 'ignored');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/cat/name-reports?status=open&page=2');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: expect.objectContaining({ accesstoken: 'fbTOKEN' }) });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/cat/cat%201/name/moderate');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'rename', name: 'Pebble' });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: 'reset' });
  });
});
