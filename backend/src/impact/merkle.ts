import { concat, getBytes, keccak256, toUtf8Bytes } from 'ethers';

/*
 * Paw settlement Merkle tree (plan G4 "Paws", F7.6). Pure functions, no I/O.
 *
 * - Leaf:  keccak256(utf8("<pawId>|<userHash>|<day>")), with userHash = keccak256(utf8(userId + salt)).
 *          The salt is random per paw and only ever returned to the paw's owner (GET /impact/me
 *          `paws.proof.salt`, so they can recompute userHash), so a public root and a published leaf
 *          list can never be linked back to an account.
 * - Pair:  keccak256(min(a, b) ++ max(a, b)) over the 32 raw bytes of each node (sorted pairs, the
 *          OpenZeppelin MerkleProof convention), so a proof is a plain list of siblings.
 * - Odd:   the last node of an odd layer is carried up unchanged.
 * - Order: leaves sorted by pawId (the settlement does this), so the root is deterministic.
 * - Memo:  `tt:paws:<YYYY-MM-DD>:<0x root>` (85 bytes), sent in full to ShelterSplit.donate.
 *
 * `verifyMerkleProof` is the same tree walk as `client/components/claims/merkle.ts` (sorted pairs,
 * lowercase 0x hex); the client plugs `hashPair` below in as its injected pair hash. The client copy is
 * recorded in docs/plans/alignment-log/4f.md.
 */

export const PAW_MEMO_PREFIX = 'tt:paws:';
const HEX = /^0x[0-9a-f]+$/;
const HASH = /^0x[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Lowercase 0x hex, or null for anything that is not hex. */
export function normalizeHex(value: string): string | null {
    const v = String(value || '')
        .trim()
        .toLowerCase();
    const prefixed = v.startsWith('0x') ? v : `0x${v}`;
    return HEX.test(prefixed) ? prefixed : null;
}

/** keccak256(userId + salt): stands in for the account inside the tree. */
export function pawUserHash(userId: string, salt: string): string {
    return keccak256(toUtf8Bytes(`${userId}${salt}`));
}

export interface PawLeafInput {
    pawId: string;
    userHash: string;
    day: string;
}

export function pawLeaf({ pawId, userHash, day }: PawLeafInput): string {
    return keccak256(toUtf8Bytes(`${pawId}|${String(userHash).toLowerCase()}|${day}`));
}

/** Sorted-pair keccak256 of two 32-byte nodes. */
export function hashPair(left: string, right: string): string {
    const a = normalizeHex(left);
    const b = normalizeHex(right);
    if (!a || !b || !HASH.test(a) || !HASH.test(b)) {
        throw new Error('hashPair: nodes must be 32-byte hex');
    }
    const [x, y] = a <= b ? [a, b] : [b, a];
    return keccak256(concat([getBytes(x), getBytes(y)]));
}

export interface MerkleTree {
    root: string;
    /** layers[0] is the leaves, the last layer is [root]. */
    layers: string[][];
}

export function buildMerkleTree(leaves: readonly string[]): MerkleTree {
    if (!leaves.length) {
        throw new Error('buildMerkleTree: no leaves');
    }
    const first = leaves.map(leaf => {
        const node = normalizeHex(leaf);
        if (!node || !HASH.test(node)) {
            throw new Error('buildMerkleTree: leaves must be 32-byte hex');
        }
        return node;
    });
    const layers: string[][] = [first];
    while (layers[layers.length - 1].length > 1) {
        const layer = layers[layers.length - 1];
        const next: string[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
        }
        layers.push(next);
    }
    return { root: layers[layers.length - 1][0], layers };
}

/** Siblings from leaf `index` up to the root. A carried-up node adds no sibling. */
export function merkleProof(tree: MerkleTree, index: number): string[] {
    if (!Number.isInteger(index) || index < 0 || index >= tree.layers[0].length) {
        throw new Error('merkleProof: index out of range');
    }
    const proof: string[] = [];
    let i = index;
    for (let level = 0; level < tree.layers.length - 1; level++) {
        const layer = tree.layers[level];
        const sibling = i % 2 === 0 ? i + 1 : i - 1;
        if (sibling < layer.length) {
            proof.push(layer[sibling]);
        }
        i = Math.floor(i / 2);
    }
    return proof;
}

/** The client's tree walk with keccak256 sorted pairs. Never throws; bad input is false. */
export function verifyMerkleProof(params: { leaf: string; proof: readonly string[]; root: string }): boolean {
    let node = normalizeHex(params.leaf);
    const root = normalizeHex(params.root);
    if (!node || !root || !HASH.test(node) || !HASH.test(root) || !Array.isArray(params.proof)) {
        return false;
    }
    for (const step of params.proof) {
        const sibling = normalizeHex(step);
        if (!sibling || !HASH.test(sibling)) {
            return false;
        }
        node = hashPair(node, sibling);
    }
    return node === root;
}

/** Recomputes the leaf from the proof's fields, then walks it to the root. */
export function verifyPawProof(params: PawLeafInput & { proof: readonly string[]; root: string }): boolean {
    if (!DAY.test(String(params.day || '')) || !params.pawId) {
        return false;
    }
    const userHash = normalizeHex(params.userHash);
    if (!userHash || !HASH.test(userHash)) {
        return false;
    }
    return verifyMerkleProof({
        leaf: pawLeaf({ pawId: params.pawId, userHash, day: params.day }),
        proof: params.proof,
        root: params.root,
    });
}

export function pawMemo(day: string, root: string): string {
    const node = normalizeHex(root);
    if (!DAY.test(day) || !node || !HASH.test(node)) {
        throw new Error('pawMemo: bad day or root');
    }
    return `${PAW_MEMO_PREFIX}${day}:${node}`;
}

/** Same pattern as the client's `parsePawMemo`. */
export function parsePawMemo(memo: string): { day: string; root: string } | null {
    const m = /^tt:paws:(\d{4}-\d{2}-\d{2}):(0x[0-9a-fA-F]{64})$/.exec(String(memo || ''));
    return m ? { day: m[1], root: m[2].toLowerCase() } : null;
}
