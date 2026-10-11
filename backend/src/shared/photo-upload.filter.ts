import { ArgumentsHost, BadRequestException, Catch, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { YOURCAT_ERRORS } from 'src/yourcat/yourcat.errors';
import { PhotoError, PhotoTypeError } from './utils/photo-upload';

/*
 * Multer errors on the photo routes (`POST /yourcat`, `POST /image/portrait`). Multer runs in the
 * `FileInterceptor`, before the handler, so its errors never reach the handler's own mapping. This
 * method-level filter turns them into the `{ statusCode, code, message }` bodies of
 * docs/plans/yourcat-v2.md section 2.3; every other exception passes through unchanged.
 */

/** Messages Nest gives multer's count and field limits (platform-express multer.constants). */
const MULTER_COUNT_MESSAGES = [
    'Too many parts',
    'Too many files',
    'Field name too long',
    'Field value too long',
    'Too many fields',
    'Unexpected field',
];
const MULTER_COUNT_CODES = [
    'LIMIT_PART_COUNT',
    'LIMIT_FILE_COUNT',
    'LIMIT_FIELD_KEY',
    'LIMIT_FIELD_VALUE',
    'LIMIT_FIELD_COUNT',
    'LIMIT_UNEXPECTED_FILE',
];

const PHOTO_ERROR_MAP = {
    FILE_REQUIRED: () => YOURCAT_ERRORS.fileRequired(),
    FILE_TOO_LARGE: () => YOURCAT_ERRORS.fileTooLarge(),
    FILE_TYPE: () => YOURCAT_ERRORS.fileType(),
    NOT_DECODABLE: () => YOURCAT_ERRORS.notDecodable(),
} as const;

/** The `YOURCAT_*` error for a photo upload failure, or null for any other exception. */
export function mapPhotoUploadError(exception: unknown): HttpException | null {
    if (exception instanceof PhotoTypeError) {
        return YOURCAT_ERRORS.fileType();
    }
    if (exception instanceof PhotoError) {
        return PHOTO_ERROR_MAP[exception.code]();
    }
    if (exception instanceof PayloadTooLargeException) {
        return YOURCAT_ERRORS.fileTooLarge();
    }
    const code = (exception as { code?: unknown })?.code;
    if (code === 'LIMIT_FILE_SIZE') {
        return YOURCAT_ERRORS.fileTooLarge();
    }
    if (typeof code === 'string' && MULTER_COUNT_CODES.includes(code)) {
        return YOURCAT_ERRORS.fileRequired();
    }
    if (exception instanceof BadRequestException) {
        const response = exception.getResponse();
        const message = typeof response === 'string' ? response : (response as { message?: unknown })?.message;
        if (typeof message === 'string' && MULTER_COUNT_MESSAGES.includes(message)) {
            return YOURCAT_ERRORS.fileRequired();
        }
    }
    return null;
}

@Catch()
export class PhotoUploadExceptionFilter extends BaseExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        super.catch(mapPhotoUploadError(exception) ?? exception, host);
    }
}
