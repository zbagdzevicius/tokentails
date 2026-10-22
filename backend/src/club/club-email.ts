import { escapeHtml, FetchLike } from 'src/badcat/badcat-email';

/*
 * The one Tails Club email: the 15-minute "manage or cancel" link (POST /club/portal with an email).
 * SendGrid over fetch, as Bad Cat Daily does; resolves true only when SendGrid accepted the message and never
 * throws. Stripe sends receipts itself (Dashboard: email receipts on).
 */

export async function sendClubEmail(
    to: string,
    subject: string,
    html: string,
    env: NodeJS.ProcessEnv = process.env,
    fetchImpl: FetchLike = (url, init) => fetch(url, init)
): Promise<boolean> {
    const key = (env.SENDGRID_API_KEY || '').trim();
    if (!key || !to) return false;
    try {
        const res = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }], subject }],
                from: { email: env.SENDGRID_FROM_EMAIL || 'hello@tokentails.com', name: 'Tails Club' },
                content: [{ type: 'text/html', value: html }],
            }),
        });
        return res.ok;
    } catch (error) {
        console.error('Tails Club email failed:', (error as Error)?.message);
        return false;
    }
}

export function portalEmailHtml(link: string): string {
    const safe = escapeHtml(link);
    return (
        `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">` +
        `<div style="max-width: 560px; margin: 0 auto; padding: 20px;">` +
        `<h2>Manage your Tails Club membership</h2>` +
        `<p>Tap the button within 15 minutes to change your card, see receipts or cancel.</p>` +
        `<p style="text-align:center;margin:28px 0;"><a href="${safe}" style="background:#e5487f;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;">Manage or cancel</a></p>` +
        `<p style="font-size:13px;color:#777;">Did not ask for this? Ignore it: nothing changes.</p>` +
        `<p style="margin-top: 28px; color: #777; font-size: 13px;">Tails Club by Token Tails MB. Half of every payment goes to Pink Paw.</p>` +
        `</div></body></html>`
    );
}
