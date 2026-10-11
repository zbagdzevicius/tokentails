import { sendOrderConfirmationEmail } from './order-email';

/* KI-11: the order email reports whether SendGrid accepted it. */

describe('sendOrderConfirmationEmail', () => {
    const OLD_ENV = process.env;
    const realFetch = global.fetch;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        process.env = { ...OLD_ENV, SENDGRID_API_KEY: 'test-key' };
        fetchMock = jest.fn(async () => ({ ok: true, status: 202 }));
        global.fetch = fetchMock as any;
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    afterAll(() => {
        process.env = OLD_ENV;
        global.fetch = realFetch;
    });

    it('true when SendGrid accepts the email', async () => {
        await expect(
            sendOrderConfirmationEmail('buyer@example.test', 'https://cdn.test/a.webp', { subject: 'Ready' })
        ).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const payload = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
        expect(payload.personalizations[0]).toEqual({ to: [{ email: 'buyer@example.test' }], subject: 'Ready' });
    });

    it('false without a key or an address, and nothing is sent', async () => {
        await expect(sendOrderConfirmationEmail('', 'https://cdn.test/a.webp')).resolves.toBe(false);
        delete process.env.SENDGRID_API_KEY;
        await expect(sendOrderConfirmationEmail('buyer@example.test', 'https://cdn.test/a.webp')).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('false when SendGrid refuses the email', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
        await expect(sendOrderConfirmationEmail('buyer@example.test', 'https://cdn.test/a.webp')).resolves.toBe(false);
    });

    it('false (never a throw) when the request fails', async () => {
        fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
        await expect(sendOrderConfirmationEmail('buyer@example.test', 'https://cdn.test/a.webp')).resolves.toBe(false);
    });
});
