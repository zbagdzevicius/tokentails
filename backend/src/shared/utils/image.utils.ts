const sharp = require('sharp');
const convert = require('heic-convert');
// this will grant 755 permission to webp executables
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import { v4 as generateFilename } from 'uuid';
import { uploadFile } from './aws.utils';

import { BadRequestException } from '@nestjs/common';
import { getPageHtml } from './common.utils';

export async function findImageByKeywords(query: string) {
    const searchResultsPage = await getPageHtml(
        `https://www.freepik.com/search?format=search&query=${query}&selection=1&type=photo`
    );
    let dom = new JSDOM(searchResultsPage).window.document!;
    const firstImageUrl = dom.querySelector('.showcase figure:first-of-type a')!.getAttribute('href');
    const singleImagePage = await fetch(firstImageUrl!).then(response => response.text());
    dom = new JSDOM(singleImagePage).window.document;
    const mainImageSource = dom.querySelector('.detail__preview img')!.getAttribute('src');

    return mainImageSource;
}

async function getResizedImageBuffer(image: any, width: number) {
    return sharp(image)
        .resize(width, width, {
            fit: 'inside',
        })
        .toBuffer();
}

export async function getConvertedImageBufferFromWebpUrl(url: string) {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const image = await sharp(buffer);

    return [await image.png({ quality: 90 }).toBuffer(), await image.metadata()];
}

/**
 * Check if buffer is a HEIC/HEIF image by checking magic bytes
 */
function isHeicImage(buffer: Buffer): boolean {
    if (buffer.length < 12) {
        return false;
    }
    // HEIC files start with ftyp box at offset 4
    // Check for HEIC/HEIF magic bytes: 'ftyp' at offset 4, then 'heic', 'heif', 'mif1', or 'msf1'
    const ftypOffset = buffer.toString('ascii', 4, 8);
    if (ftypOffset !== 'ftyp') {
        return false;
    }
    const brand = buffer.toString('ascii', 8, 12);
    return ['heic', 'heif', 'mif1', 'msf1'].some(b => brand.includes(b));
}

/**
 * Convert HEIC image to JPG buffer
 */
async function convertHeicToJpg(heicBuffer: Buffer): Promise<Buffer> {
    try {
        const outputBuffer = await convert({
            buffer: heicBuffer,
            format: 'JPEG',
            quality: 0.92,
        });
        return Buffer.from(outputBuffer);
    } catch (error) {
        throw new BadRequestException(`Failed to convert HEIC image to JPG: ${error}`);
    }
}

export async function uploadFileImage(buffer: Buffer, filename: string, resize = true) {
    if (!buffer) {
        throw new BadRequestException('BUFFER IS NOT PROVIDED FOR IMAGE UPLOAD');
    }
    const size = 1000;
    const extension = 'webp';
    const imageName = filename.split('.')[0] || generateFilename();

    // Check if image is HEIC format and convert to JPG if needed
    let processedBuffer = buffer;
    if (isHeicImage(buffer)) {
        processedBuffer = await convertHeicToJpg(buffer);
    }

    const image = await sharp(processedBuffer);
    let fileBuffer = image.webp({ quality: 80 });
    fileBuffer = await fileBuffer.toBuffer();
    const resizedBuffer = resize ? await getResizedImageBuffer(fileBuffer, size) : fileBuffer;
    const resizerFilename = `${imageName}.${extension}`;
    await uploadFile(resizerFilename, resizedBuffer, extension);

    return `${process.env['DO_SPACES_CDN']}/${resizerFilename}`;
}

export async function uploadFileFromUrl(url: string) {
    const filename = url.split('/').reverse()[0];
    const [name] = filename.split('.');
    const imageResponse = await fetch(url);
    const buffer = await imageResponse.buffer();
    return uploadFileImage(buffer, name);
}
