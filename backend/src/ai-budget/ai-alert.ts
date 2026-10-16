import { Logger } from '@nestjs/common';

/*
 * AI cost and delivery alerts (bet #3, docs/plans/yourcat-v2.md section 3.3). SendGrid, with the same
 * key and sender the order emails use (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL), to AI_ALERT_EMAIL_TO.
 * Skipped with a log line when either is unset. Never throws: an alert must not fail the request.
 * Alert bodies carry counts, amounts and record ids only, never an IP or a photo URL.
 */

const logger = new Logger('AiAlert');

export type AiAlertSender = (subject: string, text: string) => Promise<boolean>;

export const sendAiAlert: AiAlertSender = async (subject, text) => {
    const to = process.env.AI_ALERT_EMAIL_TO;
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!to || !apiKey) {
        logger.warn(`alert not sent (AI_ALERT_EMAIL_TO or SENDGRID_API_KEY unset): ${subject}`);
        return false;
    }
    try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }], subject }],
                from: { email: process.env.SENDGRID_FROM_EMAIL || 'hello@tokentails.com', name: 'TokenTails alerts' },
                content: [{ type: 'text/plain', value: text }],
            }),
        });
        if (!response.ok) {
            logger.error(`alert email failed with HTTP ${response.status}: ${subject}`);
            return false;
        }
        return true;
    } catch (error) {
        logger.error(`alert email failed: ${subject}`, (error as Error)?.message);
        return false;
    }
};
