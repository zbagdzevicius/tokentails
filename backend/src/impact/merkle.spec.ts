import { keccak256, toUtf8Bytes } from 'ethers';
// The browser verifier /impact runs (task 3f). It takes the pair hash as an argument; the backend's
// `hashPair` is what the client plugs in, so this spec proves server proofs verify client-side.
import {
    parsePawMemo as clientParsePawMemo,
    verifyMerkleProof as clientVerify,
} from '../../../client/components/claims/merkle';
import {
    buildMerkleTree,
    hashPair,
    merkleProof,
    parsePawMemo,
    pawLeaf,
    pawMemo,
    pawUserHash,
    verifyMerkleProof,
    verifyPawProof,
} from './merkle';

const leafOf = (i: number) => {
    const userHash = pawUserHash(`user-${i}`, `0x${'0'.repeat(63)}${i % 10}`);
    return { pawId: i.toString(16).padStart(32, '0'), userHash, day: '2026-10-01' };
};

describe('paw Merkle tree (plan G4)', () => {
    it('hashes the plan leaf pawId|keccak(userId+salt)|day', () => {
        const userHash = pawUserHash('652f00000000000000000001', '0xabc');
        expect(userHash).toBe(keccak256(toUtf8Bytes('652f000000000000000000010xabc')));
        expect(pawLeaf({ pawId: 'p1', userHash, day: '2026-10-01' })).toBe(
            keccak256(toUtf8Bytes(`p1|${userHash}|2026-10-01`))
        );
    });

    it('sorts pairs, so hashPair(a, b) equals hashPair(b, a)', () => {
        const a = pawLeaf(leafOf(1));
        const b = pawLeaf(leafOf(2));
        expect(hashPair(a, b)).toBe(hashPair(b, a));
        expect(() => hashPair('0x12', b)).toThrow();
    });

    it.each([1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 33])(
        'every proof of a %i-leaf tree verifies on the server and with the client verifier',
        async count => {
            const inputs = Array.from({ length: count }, (_, i) => leafOf(i));
            const tree = buildMerkleTree(inputs.map(pawLeaf));
            if (count === 1) {
                expect(tree.root).toBe(pawLeaf(inputs[0]));
            }
            for (let i = 0; i < count; i++) {
                const proof = merkleProof(tree, i);
                const leaf = pawLeaf(inputs[i]);
                expect(verifyMerkleProof({ leaf, proof, root: tree.root })).toBe(true);
                expect(verifyPawProof({ ...inputs[i], proof, root: tree.root })).toBe(true);
                await expect(clientVerify({ leaf, proof, root: tree.root, hashPair })).resolves.toBe(true);
            }
        }
    );

    it('rejects a wrong leaf, a wrong root, a tampered sibling and a different day', async () => {
        const inputs = Array.from({ length: 6 }, (_, i) => leafOf(i));
        const tree = buildMerkleTree(inputs.map(pawLeaf));
        const proof = merkleProof(tree, 2);
        const leaf = pawLeaf(inputs[2]);
        const flipped = proof[0].slice(0, -1) + (proof[0].endsWith('0') ? '1' : '0');
        expect(verifyMerkleProof({ leaf: pawLeaf(inputs[3]), proof, root: tree.root })).toBe(false);
        expect(verifyMerkleProof({ leaf, proof, root: pawLeaf(inputs[0]) })).toBe(false);
        expect(verifyMerkleProof({ leaf, proof: [flipped, ...proof.slice(1)], root: tree.root })).toBe(false);
        expect(verifyPawProof({ ...inputs[2], day: '2026-10-02', proof, root: tree.root })).toBe(false);
        expect(verifyMerkleProof({ leaf: 'nope', proof, root: tree.root })).toBe(false);
        await expect(
            clientVerify({ leaf, proof: [flipped, ...proof.slice(1)], root: tree.root, hashPair })
        ).resolves.toBe(false);
    });

    it('writes the full 85-byte memo that both parsers read back', () => {
        const tree = buildMerkleTree([pawLeaf(leafOf(1)), pawLeaf(leafOf(2))]);
        const memo = pawMemo('2026-10-01', tree.root);
        expect(memo).toHaveLength(85);
        expect(parsePawMemo(memo)).toEqual({ day: '2026-10-01', root: tree.root });
        expect(clientParsePawMemo(memo)).toEqual({ day: '2026-10-01', root: tree.root });
        expect(() => pawMemo('2026-1-1', tree.root)).toThrow();
        expect(parsePawMemo(memo.slice(0, 64))).toBeNull();
    });

    it('refuses an empty tree and an out-of-range proof', () => {
        expect(() => buildMerkleTree([])).toThrow();
        const tree = buildMerkleTree([pawLeaf(leafOf(1))]);
        expect(merkleProof(tree, 0)).toEqual([]);
        expect(() => merkleProof(tree, 1)).toThrow();
    });
});
