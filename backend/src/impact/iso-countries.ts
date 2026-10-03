/**
 * ISO 3166-1 alpha-2 codes (the 249 officially assigned codes). `Shelter.countryCode` must be one of
 * them (plan F7.7); the impact snapshot and the landing globe count countries from these codes only.
 */
export const ISO_ALPHA2_CODES: readonly string[] = Object.freeze(
    (
        'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS ' +
        'BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE ' +
        'EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM ' +
        'HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC ' +
        'LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
        'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
        'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO ' +
        'TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
    ).split(' ')
);

const ISO_SET = new Set(ISO_ALPHA2_CODES);

/** True for an assigned ISO alpha-2 code, uppercase only (`LT`, never `lt` or `LTU`). */
export function isIsoAlpha2(value: unknown): value is string {
    return typeof value === 'string' && ISO_SET.has(value);
}

/** Uppercases and trims; returns null for anything that is not an assigned code. */
export function normalizeIsoAlpha2(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const code = value.trim().toUpperCase();
    return ISO_SET.has(code) ? code : null;
}
