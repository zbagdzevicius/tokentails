import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { mapPhotoUploadError, PhotoUploadExceptionFilter } from './photo-upload.filter';
import { PhotoError, PhotoTypeError } from './utils/photo-upload';

const body = (exception: unknown) => {
    const mapped = mapPhotoUploadError(exception);
    return mapped ? { status: mapped.getStatus(), response: mapped.getResponse() } : null;
};

describe('PhotoUploadExceptionFilter', () => {
    it('maps PayloadTooLargeException (multer LIMIT_FILE_SIZE) to 413 YOURCAT_FILE_TOO_LARGE with statusCode', () => {
        expect(body(new PayloadTooLargeException('File too large'))).toEqual({
            status: 413,
            response: { statusCode: 413, code: 'YOURCAT_FILE_TOO_LARGE', message: expect.any(String) },
        });
        expect(body({ code: 'LIMIT_FILE_SIZE' })?.status).toBe(413);
    });

    it('maps PhotoTypeError to 400 YOURCAT_FILE_TYPE', () => {
        expect(body(new PhotoTypeError())).toEqual({
            status: 400,
            response: { statusCode: 400, code: 'YOURCAT_FILE_TYPE', message: expect.any(String) },
        });
    });

    it('maps LIMIT_FILE_COUNT (raw or as Nest turns it into a 400) to 400 YOURCAT_FILE_REQUIRED', () => {
        expect(body({ code: 'LIMIT_FILE_COUNT' })).toEqual({
            status: 400,
            response: { statusCode: 400, code: 'YOURCAT_FILE_REQUIRED', message: 'Send exactly one photo.' },
        });
        expect((body(new BadRequestException('Too many files'))?.response as any).code).toBe('YOURCAT_FILE_REQUIRED');
        expect((body(new BadRequestException('Unexpected field'))?.response as any).code).toBe('YOURCAT_FILE_REQUIRED');
    });

    it('maps a PhotoError by its code', () => {
        expect((body(new PhotoError('NOT_DECODABLE'))?.response as any).code).toBe('YOURCAT_NOT_DECODABLE');
    });

    it('lets every other exception pass through unchanged', () => {
        const notFound = new NotFoundException('nope');
        const other = new BadRequestException('Some other validation error');
        expect(mapPhotoUploadError(notFound)).toBeNull();
        expect(mapPhotoUploadError(other)).toBeNull();
        expect(mapPhotoUploadError(new Error('boom'))).toBeNull();

        const filter = new PhotoUploadExceptionFilter();
        const parent = jest.spyOn(Object.getPrototypeOf(PhotoUploadExceptionFilter.prototype), 'catch');
        parent.mockImplementation(() => undefined);
        filter.catch(notFound, {} as any);
        expect(parent).toHaveBeenLastCalledWith(notFound, {});
        filter.catch(new PhotoTypeError(), {} as any);
        expect((parent.mock.calls[1][0] as any).getResponse().code).toBe('YOURCAT_FILE_TYPE');
        parent.mockRestore();
    });
});
