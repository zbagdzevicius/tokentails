// heic-convert ships no type declarations; this covers the call used in shared/utils/image.utils.ts.
declare module 'heic-convert' {
    interface HeicConvertOptions {
        buffer: Buffer | ArrayBufferLike;
        format: 'JPEG' | 'PNG';
        quality?: number;
    }

    function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;

    export = convert;
}
