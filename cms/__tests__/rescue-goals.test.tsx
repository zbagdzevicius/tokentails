/** @jest-environment jsdom */

/**
 * CMS Rescue Goals (plan G5, decisions #37 and #44).
 *
 * - GoalForm opens a goal only once its money is marked set aside with a line and an amount, and
 *   refuses a budget month that already holds 10 goals. Editing sends only the changed wording.
 * - DeliverPanel needs a photo and a receipt and shows the receipt's SHA-256; the tx hash is optional.
 * - CancelPanel needs a reason and an explicit confirmation.
 * - RESCUE_GOALS_API sends the lowercase `accesstoken` header and surfaces the backend's codes.
 * - Nothing in the CMS prints a Tails-to-money rate (F11 bans "Tails per").
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { GoalForm } from '@/components/rescue-goals/goal-form';
import {
  CancelPanel,
  DeliverPanel,
  GoalSummary
} from '@/components/rescue-goals/goal-panels';
import { GoalsTable } from '@/components/rescue-goals/goals-table';
import {
  compact,
  goalErrorText,
  RESCUE_GOALS_API
} from '@/api/rescue-goals-api';
import { sha256OfFile } from '@/api/payouts-api';
import {
  formatFunding,
  goalInputProblems,
  IRescueGoal,
  IRescueGoalInput,
  monthCountsOf,
  progressPercent,
  RescueGoalStatus
} from '@/models/rescue-goal';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
  Object.assign(globalThis, { TextEncoder });
});

const NOW = new Date('2026-10-02T12:00:00Z');

function file(text: string, name: string, type: string): File {
  const f = new File([text], name, { type });
  const bytes = new TextEncoder().encode(text);
  Object.defineProperty(f, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(0)
  });
  return f;
}

function goal(fields: Partial<IRescueGoal> = {}): IRescueGoal {
  return {
    id: '65f0c0ffee0000000000abcd',
    title: 'Winter food for Pink Paw',
    description: null,
    deliverable: '10 kg of kitten food',
    image: null,
    shelter: {
      _id: 's1',
      name: 'Pink Paw',
      slug: 'rozine-pedute',
      image: null,
      country: 'Lithuania',
      countryCode: 'LT'
    },
    status: RescueGoalStatus.OPEN,
    targetTails: 50000,
    raisedTails: 12500,
    remainingTails: 37500,
    pledgeCount: 14,
    endsAt: null,
    filledAt: null,
    createdAt: '2026-10-01T09:00:00Z',
    delivery: null,
    cancelledAt: null,
    budgetMonth: '2026-10',
    proofOwner: 'Proof Owner',
    funding: {
      setAside: true,
      line: 'October budget',
      amountCents: 4990,
      currency: 'EUR',
      note: null,
      setAsideAt: '2026-10-01T09:00:00Z'
    },
    cancelReason: null,
    pledges: { PENDING: 1, CONFIRMED: 14, REFUNDED: 0, REJECTED: 0 },
    receipt: null,
    budgetMonthGoals: 3,
    ...fields
  };
}

const VALID: IRescueGoalInput = {
  shelter: 's1',
  title: 'Winter food',
  deliverable: '10 kg of kitten food',
  targetTails: 50000,
  budgetMonth: '2026-10',
  proofOwner: 'Proof Owner',
  fundingSetAside: true,
  fundingLine: 'October budget',
  fundingAmount: '49.90',
  fundingCurrency: 'EUR'
};

describe('goal rules', () => {
  it('needs the money set aside, a line and an amount before a goal can open', () => {
    expect(goalInputProblems(VALID, NOW)).toEqual([]);
    expect(
      goalInputProblems({ ...VALID, fundingSetAside: false }, NOW)
    ).toEqual(['money set aside']);
    expect(
      goalInputProblems({ ...VALID, fundingLine: '', fundingAmount: '0' }, NOW)
    ).toEqual(['funding line', 'amount set aside']);
    expect(
      goalInputProblems({ ...VALID, fundingAmount: '12.345' }, NOW)
    ).toEqual(['amount set aside']);
  });

  it('checks the target, month, picture and end date like the backend', () => {
    expect(
      goalInputProblems(
        {
          ...VALID,
          targetTails: 99,
          budgetMonth: '2026-13',
          image: 'http://insecure.example/x.png',
          endsAt: '2026-10-01T00:00:00Z'
        },
        NOW
      )
    ).toEqual([
      'Tails target',
      'budget month',
      'picture URL (https)',
      'end date (in the future)'
    ]);
  });

  it('formats money, progress and month counts', () => {
    expect(formatFunding(4990, 'EUR')).toBe('49.90 EUR');
    expect(formatFunding(5, 'USD')).toBe('0.05 USD');
    expect(progressPercent({ raisedTails: 12500, targetTails: 50000 })).toBe(
      25
    );
    expect(progressPercent({ raisedTails: 999, targetTails: 1000 })).toBe(99);
    expect(progressPercent({ raisedTails: 10, targetTails: 0 })).toBe(0);
    expect(
      monthCountsOf([
        goal(),
        goal({ status: RescueGoalStatus.DELIVERED }),
        goal({ status: RescueGoalStatus.CANCELLED }),
        goal({ budgetMonth: '2026-11' })
      ])
    ).toEqual({ '2026-10': 2, '2026-11': 1 });
  });
});

describe('GoalForm', () => {
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('opens a goal only after the money is marked set aside', async () => {
    const onCreate = jest.fn().mockResolvedValue(true);
    render(
      <GoalForm
        shelters={[{ _id: 's1', name: 'Pink Paw' }]}
        onCreate={onCreate}
        now={NOW}
      />
    );
    fill('Title', 'Winter food');
    fill('What it buys', '10 kg of kitten food');
    fill('Tails target', '50000');
    fill('Proof owner', 'Proof Owner');
    fill('Budget or sponsor line', 'October budget');
    fill('Amount', '49,90');
    const open = screen.getByRole('button', { name: 'Open goal' });
    expect(open).toBeDisabled();
    // Plain text tied to the button, not a live region that re-announces on every keystroke.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('goal-missing')).toHaveTextContent(
      'money set aside'
    );
    expect(open).toHaveAccessibleDescription(/money set aside/);

    fireEvent.click(
      screen.getByLabelText(
        'The money for this goal is set aside and will be spent on it.'
      )
    );
    expect(open).toBeEnabled();
    await act(async () => {
      fireEvent.click(open);
    });
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        shelter: 's1',
        title: 'Winter food',
        targetTails: 50000,
        budgetMonth: '2026-10',
        fundingSetAside: true,
        fundingLine: 'October budget',
        fundingAmount: '49.90',
        fundingCurrency: 'EUR',
        endsAt: ''
      })
    );
  });

  it('refuses a budget month that already holds 10 goals', () => {
    render(
      <GoalForm
        shelters={[{ _id: 's1', name: 'Pink Paw' }]}
        monthCounts={{ '2026-10': 10 }}
        onCreate={jest.fn()}
        now={NOW}
      />
    );
    expect(screen.getByText(/10 of 10 goals this month/)).toBeInTheDocument();
    expect(screen.getByTestId('goal-missing')).toHaveTextContent(
      'room in 2026-10'
    );
  });

  it('edits wording only and sends just what changed', async () => {
    const onUpdate = jest.fn().mockResolvedValue(true);
    render(
      <GoalForm shelters={[]} goal={goal()} onUpdate={onUpdate} now={NOW} />
    );
    expect(screen.queryByTestId('funding-fieldset')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tails target')).toBeDisabled();
    expect(screen.getByLabelText('Budget month')).toBeDisabled();
    expect(screen.getByLabelText('Shelter')).toHaveDisplayValue('Pink Paw');
    fill('What it buys', '12 kg of kitten food');
    fill('Ends (optional)', '2026-12-31');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(onUpdate).toHaveBeenCalledWith({
      deliverable: '12 kg of kitten food',
      endsAt: '2026-12-31T23:59:59.000Z'
    });
  });
});

describe('DeliverPanel', () => {
  it('needs a photo and a receipt, shows the receipt hash and checks the tx hash', async () => {
    const onDeliver = jest.fn().mockResolvedValue(true);
    render(
      <DeliverPanel
        goal={goal({ status: RescueGoalStatus.FILLED })}
        onDeliver={onDeliver}
      />
    );
    const button = screen.getByRole('button', { name: 'Mark delivered' });
    expect(button).toBeDisabled();
    const photo = file('jpeg-bytes', 'food.jpg', 'image/jpeg');
    const receipt = file('%PDF receipt', 'receipt.pdf', 'application/pdf');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Delivery photo'), {
        target: { files: [photo] }
      });
      fireEvent.change(screen.getByLabelText('Receipt'), {
        target: { files: [receipt] }
      });
    });
    // The hash is computed with WebCrypto after the change event; wait for it under load.
    expect(await screen.findByTestId('goal-receipt-hash')).toHaveTextContent(
      await sha256OfFile(receipt)
    );
    expect(button).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Transaction hash (optional)'), {
      target: { value: '0x1234' }
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Transaction hash (optional)'), {
      target: { value: `0x${'ab'.repeat(32)}` }
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onDeliver).toHaveBeenCalledWith(
      expect.objectContaining({
        photo,
        receipt,
        txHash: `0x${'ab'.repeat(32)}`
      })
    );
  });

  it('refuses a photo over 5 MB before upload', async () => {
    render(<DeliverPanel goal={goal()} onDeliver={jest.fn()} />);
    const big = file('x', 'big.png', 'image/png');
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Delivery photo'), {
        target: { files: [big] }
      });
      fireEvent.change(screen.getByLabelText('Receipt'), {
        target: { files: [file('%PDF', 'r.pdf', 'application/pdf')] }
      });
    });
    expect(screen.getByTestId('deliver-missing')).toHaveTextContent(
      'photo under 5 MB'
    );
    expect(
      screen.getByRole('button', { name: 'Mark delivered' })
    ).toBeDisabled();
  });

  it('is hidden once a goal is delivered or cancelled', () => {
    const { container } = render(
      <>
        <DeliverPanel
          goal={goal({ status: RescueGoalStatus.DELIVERED })}
          onDeliver={jest.fn()}
        />
        <CancelPanel
          goal={goal({ status: RescueGoalStatus.CANCELLED })}
          onCancelGoal={jest.fn()}
        />
      </>
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CancelPanel', () => {
  it('needs a reason and a confirmation, and says the gives go back', async () => {
    const onCancelGoal = jest.fn().mockResolvedValue(true);
    render(<CancelPanel goal={goal()} onCancelGoal={onCancelGoal} />);
    expect(
      screen.getByText(/All 14 gives \(12,500 Tails\) go back/)
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Cancel goal' });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Shelter closed' }
    });
    expect(button).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText('Refund every give and close this goal.')
    );
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onCancelGoal).toHaveBeenCalledWith('Shelter closed');
  });
});

describe('GoalSummary and GoalsTable', () => {
  it('show funding as CMS-only and never a Tails-to-money rate', () => {
    const delivered = goal({
      status: RescueGoalStatus.DELIVERED,
      delivery: {
        photoUrl: 'https://cdn.example/rescue-goals/x.webp',
        receiptSha256: 'cd'.repeat(32),
        note: 'Bought at the local store',
        deliveredAt: '2026-10-20T10:00:00Z',
        txHash: `0x${'ef'.repeat(32)}`
      },
      receipt: { sha256: 'cd'.repeat(32), mime: 'application/pdf', size: 1000 }
    });
    const onReceipt = jest.fn();
    const { container } = render(
      <>
        <GoalSummary goal={delivered} onReceipt={onReceipt} />
        <GoalsTable goals={[goal({ id: 'g-open' }), delivered]} />
      </>
    );
    expect(screen.getAllByText(/49.90 EUR/).length).toBeGreaterThan(0);
    expect(screen.getByText(/CMS only/)).toBeInTheDocument();
    expect(
      screen.getByAltText('Delivery photo: 10 kg of kitten food')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute(
      'aria-valuenow',
      '25'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download receipt' }));
    expect(onReceipt).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(
      /Tails per|per Tail|Tails\s*=\s*/i
    );
  });

  it('flags an OPEN goal past its end date so a manager delivers or cancels it', () => {
    const expired = goal({
      id: 'g-expired',
      expired: true,
      endsAt: '2026-09-30T23:59:59Z'
    });
    render(
      <>
        <GoalSummary goal={expired} />
        <GoalsTable goals={[expired, goal({ id: 'g-live' })]} />
      </>
    );
    expect(screen.getAllByTestId('goal-expired')).toHaveLength(2);
    expect(screen.getAllByTestId('goal-expired')[0]).toHaveTextContent(
      'Ended, needs action'
    );
    expect(
      screen.getByText(/players can no longer give to it/)
    ).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    render(<GoalsTable goals={[]} />);
    expect(screen.getByTestId('goals-empty')).toHaveTextContent(
      'Open one once its money is set aside'
    );
  });
});

describe('RESCUE_GOALS_API', () => {
  beforeEach(() => {
    sessionStorage.setItem('accesstoken', 'fbtoken');
  });

  it('creates with the lowercase accesstoken header and leaves out empty fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify(goal())
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await RESCUE_GOALS_API.create({
      ...VALID,
      description: '  ',
      endsAt: ''
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/rescue-goals$/);
    expect(init.method).toBe('POST');
    expect(init.headers.accesstoken).toBe('fbtoken');
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('endsAt');
    expect(body).toMatchObject({ fundingSetAside: true, targetTails: 50000 });
    expect(compact({ a: ' x ', b: '', c: 0, d: null })).toEqual({
      a: 'x',
      c: 0
    });
  });

  it('lists through the manager route and surfaces error codes', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '[]' })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({ code: 'GOAL_FUNDING_REQUIRED', message: 'no' })
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    await RESCUE_GOALS_API.list({ status: 'OPEN', budgetMonth: '2026-10' });
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/rescue-goals\/admin\/goals\?status=OPEN&budgetMonth=2026-10$/
    );
    const result = await RESCUE_GOALS_API.create({
      ...VALID,
      fundingSetAside: false
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GOAL_FUNDING_REQUIRED');
      expect(goalErrorText(result.error)).toMatch(
        /opens only once its money is set aside/
      );
    }
    expect(
      goalErrorText({ status: 403, code: null, message: 'Forbidden resource' })
    ).toBe('Only managers can change Rescue Goals.');
  });

  it('delivers as multipart with the photo and the receipt', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify(goal({ status: RescueGoalStatus.DELIVERED }))
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await RESCUE_GOALS_API.deliver('g1', {
      photo: file('p', 'p.jpg', 'image/jpeg'),
      receipt: file('r', 'r.pdf', 'application/pdf'),
      note: ' ',
      txHash: ''
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/rescue-goals\/g1\/deliver$/);
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('photo')).toBeInstanceOf(File);
    expect(form.get('receipt')).toBeInstanceOf(File);
    expect(form.has('note')).toBe(false);
    expect(form.has('txHash')).toBe(false);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.accesstoken).toBe('fbtoken');
  });
});
