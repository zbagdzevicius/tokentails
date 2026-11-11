import { memberName } from '../party/party-names';

/*
 * The one name resolver of friends, boards and the admin view (SOCIAL-RANKED.md §2.1): the profile's chosen name (one of
 * the player's own cats, whose name G3 `name_reports` already moderates) or the generated D8 name. Never an email,
 * never a Firebase display name, never free text.
 */

const SAFE_CAT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’.-]{0,23}$/u;

export interface DisplayNameDeps {
    social: { find(filter: Record<string, unknown>): any };
    /** The cats model (find only): `{_id, name, owner}`. Absent: generated names only. */
    cats?: { find(filter: Record<string, unknown>): any } | null;
}

export async function displayNames(deps: DisplayNameDeps, ids: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return out;
    const profiles = (await deps.social.find({ _id: { $in: unique } }).lean()) as Array<{
        _id: string;
        name?: { kind?: string; catId?: string };
    }>;
    const catOf = new Map<string, string>();
    for (const p of profiles)
        if (p.name?.kind === 'cat' && p.name.catId) catOf.set(String(p._id), String(p.name.catId));
    const catNames = new Map<string, string>();
    if (catOf.size && deps.cats) {
        try {
            const cats = (await deps.cats.find({ _id: { $in: [...catOf.values()] } }).lean()) as Array<{
                _id: unknown;
                name?: string;
                owner?: unknown;
            }>;
            for (const c of cats) if (typeof c.name === 'string') catNames.set(String(c._id), `${c.owner}|${c.name}`);
        } catch {
            // a bad id: generated names
        }
    }
    for (const id of unique) {
        const catId = catOf.get(id);
        const hit = catId ? catNames.get(catId) : undefined;
        if (hit) {
            const [owner, ...rest] = hit.split('|');
            const name = rest.join('|').trim();
            // the cat must still be the account's own, and the name a plain short name
            if (owner === id && SAFE_CAT_NAME.test(name)) {
                out.set(id, name);
                continue;
            }
        }
        out.set(id, memberName(id));
    }
    return out;
}

export async function displayNameOf(deps: DisplayNameDeps, id: string): Promise<string> {
    return (await displayNames(deps, [id])).get(id) ?? memberName(id);
}
