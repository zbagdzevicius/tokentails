/*
 * The portrait order email (SendGrid), moved out of image.controller.ts so the `/yourcat` portrait
 * delivery (src/yourcat/portrait-delivery.service.ts) can send it too, with its own subject.
 *
 * Known issue (docs/BACKEND.md): the default subject "Your order is on its way!" is also used for
 * digital orders; `/yourcat` deliveries pass their own subject.
 */

export const DEFAULT_ORDER_EMAIL_SUBJECT = 'Your order is on its way!';

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// Send SendGrid email for order confirmation
export async function sendOrderConfirmationEmail(
    email: string,
    aiUrl: string,
    options: { subject?: string } = {}
): Promise<void> {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!sendgridApiKey) {
        console.warn('SENDGRID_API_KEY not configured, skipping email send');
        return;
    }

    if (!email) {
        console.warn('No email address provided, skipping email send');
        return;
    }

    const subject = options.subject || DEFAULT_ORDER_EMAIL_SUBJECT;

    try {
        const emailData = {
            personalizations: [
                {
                    to: [{ email }],
                    subject,
                },
            ],
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'hello@tokentails.com',
                name: 'TokenTails',
            },
            content: [
                {
                    type: 'text/html',
                    value: `
                        <html>
                            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                                    <h2 style="color: #4a5568;">${
                                        options.subject ? escapeHtml(subject) : 'Your order is on its way! 🎨'
                                    }</h2>
                                    <p>Thank you for your purchase! We're excited to share your pet portrait with you.</p>
                                    <p>Your Pet portrait is ready:</p>
                                    <div style="text-align: center; margin: 30px 0;">
                                        <img src="${aiUrl}" alt="Your Portrait" style="max-width: 100%; height: auto; border-radius: 8px;" />
                                    </div>
                                    <p>If you have any questions, please don't hesitate to contact us.</p>
                                    <p>While you're waiting, you can <a href="https://tokentails.com/game">see your pet</a> in our game as your playable character!</p>
                                    <p style="margin-top: 30px; color: #718096; font-size: 14px;">
                                        Best regards,<br />
                                        The TokenTails Team
                                    </p>
                                </div>
                            </body>
                        </html>
                    `,
                },
            ],
        };

        await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${sendgridApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailData),
        }).catch(error => {
            console.error('Error sending SendGrid email:', error);
        });
    } catch (error) {
        console.error('Error in sendOrderConfirmationEmail:', error);
        // Don't throw - we don't want to fail the webhook if email fails
    }
}
