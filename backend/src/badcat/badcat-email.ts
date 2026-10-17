/*
 * Bad Cat Daily emails over SendGrid (the restore magic link and the weekly Club "seen" email). Resolves
 * true only when SendGrid accepted the message; never throws. Callers check `sendgridConfigured`
 * first; specs replace `fetch`.
 */

export const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number }>;

export async function sendBadcatEmail(
    to: string,
    subject: string,
    html: string,
    fetchImpl: FetchLike = (url, init) => fetch(url, init)
): Promise<boolean> {
    const key = process.env.SENDGRID_API_KEY;
    if (!key || !to) return false;
    try {
        const res = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }], subject }],
                from: { email: process.env.SENDGRID_FROM_EMAIL || 'hello@tokentails.com', name: 'Bad Cat Daily' },
                content: [{ type: 'text/html', value: html }],
            }),
        });
        return res.ok;
    } catch (error) {
        console.error('Bad Cat email failed:', (error as Error)?.message);
        return false;
    }
}

const frame = (body: string) =>
    `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">` +
    `<div style="max-width: 560px; margin: 0 auto; padding: 20px;">${body}` +
    `<p style="margin-top: 28px; color: #777; font-size: 13px;">Bad Cat Daily by Token Tails. 10% of net goes to Pink Paw.</p>` +
    `</div></body></html>`;

export function restoreEmailHtml(link: string): string {
    const safe = escapeHtml(link);
    return frame(
        `<h2>Your purchases, back where they belong</h2>` +
            `<p>Tap the button within 30 minutes to restore Chaos Club and your cat's things in this browser.</p>` +
            `<p style="text-align:center;margin:28px 0;"><a href="${safe}" style="background:#7b2cbf;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;">Restore purchases</a></p>` +
            `<p style="font-size:13px;color:#777;">Did not ask for this? Ignore it: nothing changes.</p>`
    );
}

export function seenEmailHtml(catName: string, week: number, total: number, link: string): string {
    return frame(
        `<h2>${escapeHtml(catName)} was seen in ${week.toLocaleString('en-US')} rooms this week</h2>` +
            `<p>Total so far: ${total.toLocaleString(
                'en-US'
            )} rooms. Strangers keep spotting your cat on windowsills and fridges.</p>` +
            `<p><a href="${escapeHtml(link)}">Play today's room</a></p>`
    );
}
