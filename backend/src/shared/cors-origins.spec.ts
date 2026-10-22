// `cors` is what @nestjs/platform-express runs for enableCors (no @types package here).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cors = require('cors');
import { corsOrigins, isCorsOriginAllowed } from './cors-origins';

/** Runs the real `cors` middleware (as Nest's enableCors does) and returns the allow-origin header. */
function allowOriginHeader(origin: string, frontEndUrls?: string): string | undefined {
    const headers: Record<string, string> = {};
    const req = { method: 'GET', headers: { origin } };
    const res = {
        setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
        getHeader: (k: string) => headers[k.toLowerCase()],
    };
    cors({ origin: corsOrigins(frontEndUrls), credentials: true })(req as never, res as never, () => undefined);
    return headers['access-control-allow-origin'];
}

const allowed = [
    'https://tokentails.com',
    'https://www.tokentails.com',
    'https://tokentails-landing-lab.vercel.app',
    'https://tokentails-landing-2n1w9gd1d-zbagdzevicius-projects.vercel.app',
    'https://tokentails-landing-lab-zbagdzevicius-projects.vercel.app',
];

const refused = [
    'https://evil-tokentails-landing-x.vercel.app',
    'https://evil-tokentails-landing-2n1w9gd1d-zbagdzevicius-projects.vercel.app',
    'http://tokentails-landing-2n1w9gd1d-zbagdzevicius-projects.vercel.app',
    'http://tokentails-landing-lab.vercel.app',
    'https://tokentails-landing-2n1w9gd1d-other-team-projects.vercel.app',
    'https://tokentails-landing-2n1w9gd1d-zbagdzevicius-projects.vercel.app.evil.com',
    'https://tokentails-landing-2n1w9gd1d-zbagdzevicius-projects.vercel.app:8443',
    'https://tokentails-landing-Ab12-zbagdzevicius-projects.vercel.app',
    'https://tokentails-landing-x.y-zbagdzevicius-projects.vercel.app',
    'https://some-app.vercel.app',
    'https://tokentails.com.evil.com',
];

describe('CORS origins', () => {
    it.each(allowed)('allows %s', origin => {
        expect(isCorsOriginAllowed(origin, corsOrigins(undefined))).toBe(true);
        expect(allowOriginHeader(origin)).toBe(origin);
    });

    it.each(refused)('refuses %s', origin => {
        expect(isCorsOriginAllowed(origin, corsOrigins(undefined))).toBe(false);
        expect(allowOriginHeader(origin)).toBeUndefined();
    });

    it('keeps credentials and the FRONT_END_URLS entries', () => {
        expect(allowOriginHeader('https://staging.example.com', 'https://staging.example.com')).toBe(
            'https://staging.example.com'
        );
        // Unset FRONT_END_URLS adds a literal '*', which matches no real origin.
        expect(corsOrigins(undefined)).toContain('*');
        expect(allowOriginHeader('https://anything.example.com')).toBeUndefined();
    });
});
