/*
 * Moon Rave ad slots: 20 physical places in the world, $100 each. The page draws them from its own copy,
 * cat-rave/src/ads/slots.ts (same ids, kinds and aspects); rave-ads.slots.spec.ts checks the two agree.
 *
 *   2 giant LED screens flanking the stage (16:9)   6 floor-edge LED banners (4:1)
 *   6 laser-tower wraps (1:3)                        4 blimps circling above the floor (2:1)
 *   2 moon-ring banners either side of the moon (3:1)
 *
 * `width` x `height` is the pixel size an approved image is cropped and re-encoded to.
 */

export type RaveAdSlotKind = 'screen' | 'banner' | 'tower' | 'blimp' | 'moon';

export interface RaveAdSlotSpec {
    id: string;
    kind: RaveAdSlotKind;
    width: number;
    height: number;
}

export const RAVE_AD_KIND_SIZE: Readonly<Record<RaveAdSlotKind, { width: number; height: number; count: number }>> =
    Object.freeze({
        screen: { width: 1280, height: 720, count: 2 },
        banner: { width: 1200, height: 300, count: 6 },
        tower: { width: 400, height: 1200, count: 6 },
        blimp: { width: 1000, height: 500, count: 4 },
        moon: { width: 1200, height: 400, count: 2 },
    });

export const RAVE_AD_SLOTS: readonly RaveAdSlotSpec[] = Object.freeze(
    (Object.keys(RAVE_AD_KIND_SIZE) as RaveAdSlotKind[]).flatMap(kind =>
        Array.from({ length: RAVE_AD_KIND_SIZE[kind].count }, (_, i) => ({
            id: `${kind}-${i + 1}`,
            kind,
            width: RAVE_AD_KIND_SIZE[kind].width,
            height: RAVE_AD_KIND_SIZE[kind].height,
        }))
    )
);

export const RAVE_AD_SLOT_IDS: readonly string[] = Object.freeze(RAVE_AD_SLOTS.map(s => s.id));

export const raveAdSlot = (id: unknown): RaveAdSlotSpec | null =>
    typeof id === 'string' ? RAVE_AD_SLOTS.find(s => s.id === id) || null : null;
