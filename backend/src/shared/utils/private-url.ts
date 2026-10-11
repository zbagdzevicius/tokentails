/*
 * `s3private://<key>` URLs (bet #3): records point at a private bucket object with them; no browser can
 * open one. Kept free of the S3 client so routes can check a URL without loading it.
 */
export const PRIVATE_URL_PREFIX = 's3private://';

/** The object key of an `s3private://` URL, or null for any other URL. */
export function privateKeyOf(url: unknown): string | null {
    return typeof url === 'string' && url.startsWith(PRIVATE_URL_PREFIX) ? url.slice(PRIVATE_URL_PREFIX.length) : null;
}
