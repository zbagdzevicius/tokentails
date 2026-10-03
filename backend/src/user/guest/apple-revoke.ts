import { createSign } from 'crypto';
import fetch from 'node-fetch';

/*
 * Sign in with Apple token revocation for account deletion (App Store 5.1.1(v), G9, decision #4).
 *
 * The client obtains a fresh authorization code (native `SignInWithApple.authorize`) and sends it
 * with `DELETE /user/me`. The backend exchanges it for a refresh token and revokes that token.
 * Needs APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY (the .p8 key, `\n`
 * escaped). Without them, or without a code, the revocation is skipped and logged; deletion goes on.
 */

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export interface IAppleConfig {
    teamId: string;
    keyId: string;
    clientId: string;
    privateKey: string;
}

export type AppleRevokeOutcome = 'revoked' | 'skipped-no-code' | 'skipped-no-config' | 'failed';

export function appleConfig(env: NodeJS.ProcessEnv = process.env): IAppleConfig | null {
    const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY } = env;
    if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_CLIENT_ID || !APPLE_PRIVATE_KEY) {
        return null;
    }
    return {
        teamId: APPLE_TEAM_ID,
        keyId: APPLE_KEY_ID,
        clientId: APPLE_CLIENT_ID,
        privateKey: APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
}

const base64url = (input: Buffer | string) =>
    Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** The ES256 client secret JWT Apple requires, valid for 5 minutes. */
export function appleClientSecret(config: IAppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
    const payload = base64url(
        JSON.stringify({
            iss: config.teamId,
            iat: nowSeconds,
            exp: nowSeconds + 300,
            aud: APPLE_AUDIENCE,
            sub: config.clientId,
        })
    );
    const signer = createSign('SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' });
    return `${header}.${payload}.${base64url(signature)}`;
}

type Fetch = (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export async function revokeAppleAuthorization(
    authorizationCode: string | undefined,
    config: IAppleConfig | null = appleConfig(),
    request: Fetch = fetch as unknown as Fetch
): Promise<AppleRevokeOutcome> {
    if (!authorizationCode) {
        return 'skipped-no-code';
    }
    if (!config) {
        return 'skipped-no-config';
    }
    try {
        const clientSecret = appleClientSecret(config);
        const form = (fields: Record<string, string>) => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(fields).toString(),
        });
        const tokenResponse = await request(
            TOKEN_URL,
            form({
                client_id: config.clientId,
                client_secret: clientSecret,
                code: authorizationCode,
                grant_type: 'authorization_code',
            })
        );
        const tokens = tokenResponse.ok ? await tokenResponse.json() : null;
        const token = tokens?.refresh_token || tokens?.access_token;
        if (!token) {
            return 'failed';
        }
        const revoke = await request(
            REVOKE_URL,
            form({
                client_id: config.clientId,
                client_secret: clientSecret,
                token,
                token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
            })
        );
        return revoke.ok ? 'revoked' : 'failed';
    } catch {
        return 'failed';
    }
}
