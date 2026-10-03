import { PutObjectCommand, S3 } from '@aws-sdk/client-s3';

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
