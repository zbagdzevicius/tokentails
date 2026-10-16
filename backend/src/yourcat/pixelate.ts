import sharp = require('sharp');

/*
 * Turns the model's pixel-art drawing into a real pixel grid, whatever it returned (bet #3, section 4.3):
 * 96 x 96 nearest-neighbour, scaled back up to 768 x 768 nearest-neighbour, a 48-colour palette PNG.
 */

export const AVATAR_GRID = 96;
export const AVATAR_SIZE = 768;
export const AVATAR_COLOURS = 48;

export async function pixelateAvatar(image: Buffer): Promise<Buffer> {
    const grid = await sharp(image)
        .resize(AVATAR_GRID, AVATAR_GRID, { fit: 'cover', kernel: 'nearest' })
        .png()
        .toBuffer();
    return sharp(grid)
        .resize(AVATAR_SIZE, AVATAR_SIZE, { kernel: 'nearest' })
        .png({ palette: true, colours: AVATAR_COLOURS })
        .toBuffer();
}
