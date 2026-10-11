import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';

import * as dotenv from 'dotenv';
dotenv.config();

function getClient() {
    return new S3({
        endpoint: process.env.DO_SPACES_ENDPOINT,
        region: 'fra1',
        credentials: {
            accessKeyId: process.env.DO_SPACES_KEY!,
            secretAccessKey: process.env.DO_SPACES_SECRET!,
        },
    });
}

const client = getClient();

function getBucketParams(filename: string, buffer: any, extension: 'webp' | 'png' | 'jpeg') {
    return {
        Bucket: process.env.DO_SPACES_NAME,
        Key: filename,
        Body: buffer,
        ACL: 'public-read',
        ContentType: `image/${extension}`,
    };
}

async function sendFile(bucketParams: any) {
    return client.send(new PutObjectCommand(bucketParams));
}

export async function uploadFile(filename: string, buffer: any, extension: 'webp' | 'png' | 'jpeg') {
    const bucketParams = getBucketParams(filename, buffer, extension);
    await sendFile(bucketParams);
}

/**
 * Uploads a public object with an explicit content type and cache policy (the impact snapshot mirror,
 * plan F7.3). Same client, credentials and ACL as the image uploads; `bucket` defaults to DO_SPACES_NAME.
 */
export async function uploadPublicObject(params: {
    key: string;
    body: string | Buffer;
    contentType: string;
    cacheControl: string;
    bucket?: string | null;
}) {
    await sendFile({
        Bucket: params.bucket || process.env.DO_SPACES_NAME,
        Key: params.key,
        Body: params.body,
        ACL: 'public-read',
        ContentType: params.contentType,
        CacheControl: params.cacheControl,
    });
}

/*
 * Private objects (bet #3 `/yourcat`, docs/plans/yourcat-v2.md section 2.7). The sanitized original photo
 * is stored with `ACL: 'private'` in the same bucket and read back by the backend only. Records point at
 * it with an `s3private://<key>` URL, which no browser can open.
 */
export const PRIVATE_URL_PREFIX = 's3private://';
export const YOURCAT_ORIGINALS_PREFIX = 'yourcat/originals/';

export async function uploadPrivateObject(key: string, buffer: Buffer, contentType: string) {
    await sendFile({
        Bucket: process.env.DO_SPACES_NAME,
        Key: key,
        Body: buffer,
        ACL: 'private',
        ContentType: contentType,
    });
}

export async function getPrivateObject(key: string): Promise<{ data: Buffer; mimeType: string }> {
    const result: any = await client.send(new GetObjectCommand({ Bucket: process.env.DO_SPACES_NAME, Key: key }));
    const bytes: Uint8Array = await result.Body.transformToByteArray();
    return { data: Buffer.from(bytes), mimeType: (result.ContentType || 'application/octet-stream').split(';')[0] };
}

export async function deleteObject(key: string) {
    await client.send(new DeleteObjectCommand({ Bucket: process.env.DO_SPACES_NAME, Key: key }));
}

/** The object key of an `s3private://` URL, or null for any other URL. */
export function privateKeyOf(url: unknown): string | null {
    return typeof url === 'string' && url.startsWith(PRIVATE_URL_PREFIX) ? url.slice(PRIVATE_URL_PREFIX.length) : null;
}

/**
 * The bytes and MIME type of an image URL. An `s3private://` URL is read from the bucket only when
 * `allowPrivate` is true and the key is a `/yourcat` original; anything else throws, so an edited image
 * URL can never reach a private object. Any other URL is fetched.
 */
export async function loadImageBytes(
    url: string,
    options: { allowPrivate: boolean }
): Promise<{ data: Buffer; mimeType: string }> {
    const key = privateKeyOf(url);
    if (key !== null) {
        if (!options.allowPrivate || !key.startsWith(YOURCAT_ORIGINALS_PREFIX) || key.includes('..')) {
            throw new Error('private image URL refused');
        }
        return getPrivateObject(key);
    }
    const response = await fetch(url);
    const data = Buffer.from(await response.arrayBuffer());
    const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return { data, mimeType };
}
