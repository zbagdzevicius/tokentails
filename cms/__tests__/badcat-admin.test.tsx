/** @jest-environment jsdom */

/**
 * Bad Cat Daily moderation page: the admin routes with the lowercase `accesstoken` header, and the three tables
 * (cameo faces, the room feed queue, creator codes with their 20 % share).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { badcatAdmin, CreatorTable, dollars, FacesTable, RoomsTable } from '@/pages/badcat';

const realFetch = global.fetch;

describe('badcat admin api', () => {
  afterEach(() => {
    sessionStorage.clear();
    global.fetch = realFetch;
  });

  it('reads the room queue and posts a decision with the accesstoken header', async () => {
    sessionStorage.setItem('accesstoken', 'fbtoken');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ ok: true, status: 'approved' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await badcatAdmin.rooms('pending')).toEqual([]);
    await badcatAdmin.reviewRoom('Ab3dEf7h', 'approve');
    const [url1, init1] = fetchMock.mock.calls[0];
    expect(url1).toMatch(/\/badcat\/admin\/rooms\?status=pending$/);
    expect(init1.headers.accesstoken).toBe('fbtoken');
    const [url2, init2] = fetchMock.mock.calls[1];
    expect(url2).toMatch(/\/badcat\/admin\/rooms\/Ab3dEf7h\/approve$/);
    expect(init2.method).toBe('POST');
  });
});

describe('badcat admin tables', () => {
  it('says when Bad Cat is off', () => {
    render(<FacesTable items={null} onReview={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('switched off');
  });

  it('approves a face', () => {
    const onReview = jest.fn();
    render(
      <FacesTable
        items={[{ id: 'f1', catCode: 'AbCd', cameoId: 'c1', createdAt: '2026-11-20T10:00:00Z', dataUrl: 'data:image/png;base64,AA==' }]}
        onReview={onReview}
      />
    );
    fireEvent.click(screen.getByText('Approve'));
    expect(onReview).toHaveBeenCalledWith('f1', 'approve');
  });

  it('lists rooms with a link into the game and hides a reported one', () => {
    const onReview = jest.fn();
    render(
      <RoomsTable
        items={[
          {
            id: 'Ab3dEf7h',
            code: 'CODE-1',
            title: 'Glass Palace',
            author: 'Mia',
            shell: 0,
            props: 22,
            plays: 3,
            reports: 2,
            feed: true,
            status: 'approved',
            createdAt: 'x',
          },
        ]}
        onReview={onReview}
      />
    );
    expect(screen.getByText('Glass Palace').closest('a')).toHaveAttribute('href', 'https://tokentails.com/badcat/r?r=CODE-1');
    expect(screen.queryByText('Approve')).toBeNull();
    fireEvent.click(screen.getByText('Hide'));
    expect(onReview).toHaveBeenCalledWith('Ab3dEf7h', 'hide');
  });

  it('shows the creator share from the report', () => {
    render(
      <CreatorTable
        codes={[{ code: 'mochi_tv', email: 'a@b.c', status: 'approved' }]}
        report={[{ code: 'mochi_tv', buyers: 3, grossCents: 1497, netCents: 1365, shareCents: 2730, payable: true }]}
        onReview={() => undefined}
      />
    );
    expect(screen.getByText('$27.30 (payable)')).toBeInTheDocument();
    expect(dollars(199)).toBe('$1.99');
  });
});
