/** @jest-environment jsdom */

/**
 * CMS payout attestation and shelter outcomes (plan G4, G11, decision #78).
 *
 * - ConfirmPanel hashes the chosen receipt in the browser and only enables Confirm when it matches the
 *   draft's SHA-256; a draft author is told another member must confirm.
 * - ReviewPanel: the author and the redactor cannot approve; approval needs the redaction check.
 * - OutcomeForm accepts the animal's name only.
 * - PAYOUTS_API / OUTCOMES_API send the lowercase `accesstoken` header and surface error codes.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import {
  ConfirmPanel,
  SignaturePanel
} from '@/components/payouts/payout-review';
import { RedactionEditor } from '@/components/outcomes/redaction-editor';
import { ReviewPanel } from '@/components/outcomes/review-panel';
import { OutcomeForm } from '@/components/outcomes/outcome-form';
import {
  errorText,
  IPayout,
  PAYOUTS_API,
  sha256OfFile
} from '@/api/payouts-api';
import { normalizeRegion, OUTCOMES_API } from '@/api/outcomes-api';
import { approvalBlocker, IOutcome, OUTCOME_TYPES } from '@/models/outcome';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
  Object.assign(globalThis, { TextEncoder });
});

/** jsdom's File has no arrayBuffer(); give it the bytes it was built from. */
function file(
  text: string,
  name = 'receipt.pdf',
  type = 'application/pdf'
): File {
  const f = new File([text], name, { type });
  const bytes = new TextEncoder().encode(text);
  Object.defineProperty(f, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(0)
  });
  return f;
}

const RECEIPT_TEXT = '%PDF-1.4 receipt for 40 EUR';

async function hashOf(text: string) {
  return sha256OfFile(file(text));
}

async function payout(fields: Partial<IPayout> = {}): Promise<IPayout> {
  return {
    id: 'p-0123456789ab',
    shelter: {
      _id: 's1',
      slug: 'rozine-pedute',
      name: 'Pink Paw',
      handoverStatus: 'held-by-token-tails'
    },
    status: 'DRAFT',
    tier: null,
    purpose: 'outcome',
    amountWei: '40000000000000000000',
    amount: '40.0',
    symbol: 'EUR',
    paidAt: '2026-09-28',
    method: 'bank-transfer',
    pledgeMonth: null,
    usdEquivalent: null,
    reference: null,
    txHash: null,
    receipt: {
      sha256: await hashOf(RECEIPT_TEXT),
      size: 10,
      mime: 'application/pdf',
      uploadedAt: '2026-09-28T00:00:00Z'
    },
    attestationHash: 'ab'.repeat(32),
    attestationMessage: 'Token Tails payout attestation',
    createdByMe: false,
    confirmedAt: null,
    signature: null,
    canConfirm: true,
    canSign: false,
    createdAt: null,
    ...fields
  };
}

const outcome = (fields: Partial<IOutcome> = {}): IOutcome => ({
  id: 'o-0123456789ab',
  type: 'surgery',
  date: '2026-09-20',
  shelter: 'rozine-pedute',
  shelterId: 's1',
  animalName: 'Murka',
  amount: '120.0',
  amountWei: '120000000000000000000',
  symbol: 'EUR',
  tier: null,
  payoutId: null,
  payoutTxHash: null,
  imageUrl: null,
  status: 'awaiting-approval',
  hasImage: true,
  imageRegions: 1,
  redacted: true,
  redactedByMe: false,
  createdByMe: false,
  approvedByMe: false,
  canApprove: true,
  blocker: null,
  publishedAt: null,
  ...fields
});

describe('ConfirmPanel', () => {
  it('enables Confirm only for the receipt that matches the draft, and sends the attestation hash', async () => {
    const onConfirm = jest.fn().mockResolvedValue({ ok: true, data: {} });
    const p = await payout();
    render(<ConfirmPanel payout={p} onConfirm={onConfirm} />);
    const input = screen.getByLabelText('Your copy of the receipt');
    const button = screen.getByRole('button', { name: 'Confirm this payout' });
    expect(button).toBeDisabled();

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [file('%PDF-1.4 receipt for 400 EUR')] }
      });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'different from the receipt'
    );
    expect(button).toBeDisabled();

    const good = file(RECEIPT_TEXT);
    await act(async () => {
      fireEvent.change(input, { target: { files: [good] } });
    });
    expect(
      await screen.findByText('The file matches the receipt on the draft.')
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onConfirm).toHaveBeenCalledWith(p.attestationHash, good);
  });

  it("tells a draft's author that another member must confirm, and shows the server's reason on refusal", async () => {
    const { rerender } = render(
      <ConfirmPanel
        payout={await payout({ createdByMe: true, canConfirm: false })}
        onConfirm={jest.fn()}
      />
    );
    expect(
      screen.getByText(/another member of the shelter has to confirm/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const onConfirm = jest.fn().mockResolvedValue({
      ok: false,
      error: { status: 400, code: 'PAYOUT_RECEIPT_MISMATCH', message: 'x' }
    });
    rerender(<ConfirmPanel payout={await payout()} onConfirm={onConfirm} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Your copy of the receipt'), {
        target: { files: [file(RECEIPT_TEXT)] }
      });
    });
    await screen.findByText('The file matches the receipt on the draft.');
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm this payout' })
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'not the receipt attached to the draft'
    );
  });

  it('renders nothing once the payout is no longer a draft', async () => {
    const { container } = render(
      <ConfirmPanel
        payout={await payout({ status: 'SHELTER_CONFIRMED' })}
        onConfirm={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SignaturePanel', () => {
  it('waits for the handover, then accepts only a 65-byte hex signature', async () => {
    const { rerender } = render(
      <SignaturePanel payout={await payout()} onSign={jest.fn()} />
    );
    expect(
      screen.getByText(/Opens once the shelter holds its own wallet key/)
    ).toBeInTheDocument();

    const onSign = jest.fn().mockResolvedValue({ ok: true, data: {} });
    rerender(
      <SignaturePanel
        payout={await payout({ canSign: true })}
        onSign={onSign}
      />
    );
    const box = screen.getByLabelText('Signature');
    const submit = screen.getByRole('button', { name: 'Submit signature' });
    fireEvent.change(box, { target: { value: '0x1234' } });
    expect(submit).toBeDisabled();
    fireEvent.change(box, { target: { value: '0x' + 'ab'.repeat(65) } });
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(onSign).toHaveBeenCalledWith('0x' + 'ab'.repeat(65));
  });
});

describe('ReviewPanel (decision #78)', () => {
  it('lets a second reviewer approve a checked outcome', async () => {
    const onApprove = jest.fn().mockResolvedValue(true);
    render(
      <ReviewPanel
        outcome={outcome()}
        onRedacted={jest.fn()}
        onApprove={onApprove}
        onUnpublish={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Checked by another reviewer')).toBeChecked();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve and publish' })
      );
    });
    expect(onApprove).toHaveBeenCalled();
  });

  it.each([
    [{ createdByMe: true }, 'You wrote it'],
    [{ redactedByMe: true }, 'You did the redaction check'],
    [
      { redacted: false, status: 'awaiting-redaction' as const },
      'Tick the redaction check first'
    ]
  ])('blocks approval for %j', (fields, reason) => {
    render(
      <ReviewPanel
        outcome={outcome(fields)}
        onRedacted={jest.fn()}
        onApprove={jest.fn()}
        onUnpublish={jest.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Approve and publish' })
    ).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(reason);
  });

  it('ticks the redaction check and offers Unpublish once published', async () => {
    const onRedacted = jest.fn().mockResolvedValue(true);
    const { rerender } = render(
      <ReviewPanel
        outcome={outcome({ redacted: false, status: 'awaiting-redaction' })}
        onRedacted={onRedacted}
        onApprove={jest.fn()}
        onUnpublish={jest.fn()}
      />
    );
    await act(async () => {
      fireEvent.click(
        screen.getByLabelText('I checked the photo and the text')
      );
    });
    expect(onRedacted).toHaveBeenCalledWith(true);
    rerender(
      <ReviewPanel
        outcome={outcome({
          status: 'published',
          publishedAt: '2026-10-01T10:00:00Z'
        })}
        onRedacted={jest.fn()}
        onApprove={jest.fn()}
        onUnpublish={jest.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Unpublish' })
    ).toBeInTheDocument();
    expect(approvalBlocker(outcome({ status: 'published' }))).toBe(
      'Already published'
    );
  });
});

describe('OutcomeForm', () => {
  it("accepts the animal's name only", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(
      <OutcomeForm
        shelters={[{ _id: 's1', name: 'Pink Paw' }]}
        onSubmit={onSubmit}
      />
    );
    const name = screen.getByLabelText("Animal's name (optional)");
    fireEvent.change(name, { target: { value: 'Call +370 600 00000' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "The animal's name only"
    );
    expect(
      screen.getByRole('button', { name: 'Create outcome' })
    ).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Pūkas' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create outcome' }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        shelter: 's1',
        type: 'treatment',
        animalName: 'Pūkas',
        amount: '',
        symbol: ''
      })
    );
    expect(OUTCOME_TYPES).toHaveLength(6);
  });
});

describe('API helpers', () => {
  beforeEach(() => {
    sessionStorage.setItem('accesstoken', 'fbtoken');
  });

  it('send the lowercase accesstoken header, multipart for receipts, and return the error code', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () =>
        JSON.stringify({ code: 'PAYOUT_AUTHOR_CANNOT_CONFIRM', message: 'no' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await PAYOUTS_API.confirm(
      'p-0123456789ab',
      'ab'.repeat(32),
      file(RECEIPT_TEXT)
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/impact\/payouts\/p-0123456789ab\/confirm$/);
    expect(init.headers.accesstoken).toBe('fbtoken');
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect(result).toEqual({
      ok: false,
      error: {
        status: 403,
        code: 'PAYOUT_AUTHOR_CANNOT_CONFIRM',
        message: 'no'
      }
    });
    if (!result.ok) expect(errorText(result.error)).toMatch(/Another member/);
  });

  it('OUTCOMES_API sends JSON with the header and normalizeRegion clamps boxes', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"id":"o-1"}'
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await OUTCOMES_API.setRedacted('o-0123456789ab', true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /\/impact\/outcomes\/manage\/o-0123456789ab\/redaction$/
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: '{"redacted":true}',
        headers: expect.objectContaining({
          accesstoken: 'fbtoken',
          'Content-Type': 'application/json'
        })
      })
    );
    expect(result).toEqual({ ok: true, data: { id: 'o-1' } });
    expect(normalizeRegion({ x: 0.9, y: 0.5 }, { x: 1.4, y: -0.2 })).toEqual({
      x: 0.9,
      y: 0,
      w: 0.09999999999999998,
      h: 0.5
    });
    expect(
      normalizeRegion({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.6 })
    ).toBeNull();
  });
});

describe('RedactionEditor', () => {
  it('adds a box from the keyboard (percent inputs) as well as by dragging', async () => {
    Object.assign(URL, {
      createObjectURL: jest.fn(() => 'blob:photo'),
      revokeObjectURL: jest.fn()
    });
    const onSave = jest.fn(async () => true);
    render(<RedactionEditor onSave={onSave} />);
    const photo = file('jpeg bytes', 'cat.jpg', 'image/jpeg');
    fireEvent.change(screen.getByLabelText(/Photo \(JPEG/), {
      target: { files: [photo] }
    });
    const add = screen.getByRole('button', { name: 'Add box' });
    expect(add).toBeDisabled();
    for (const [label, value] of [
      ['Left %', '10'],
      ['Top %', '20'],
      ['Width %', '30'],
      ['Height %', '40']
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(screen.getByRole('button', { name: 'Remove box 1' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Process photo \(1 box\)/ }));
    });
    expect(onSave).toHaveBeenCalledWith(photo, [
      expect.objectContaining({ x: 0.1, y: 0.2 })
    ]);
    const [[, [box]]] = onSave.mock.calls as unknown as [[File, { w: number; h: number }[]]];
    expect(box.w).toBeCloseTo(0.3);
    expect(box.h).toBeCloseTo(0.4);
  });
});
