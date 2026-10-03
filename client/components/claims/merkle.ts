/**
 * Client-side Merkle proof check for paw settlements (plan G4, F7.6). Each nightly settlement sends
 * one ShelterSplit donate with the memo `tt:paws:<day>:<root>`; a player's paw proof is the path
 * from their leaf to that root.
 *
 * Placeholder until task 4f publishes proofs: the leaf encoding and the hash (keccak-256 in the plan)
 * are fixed there. This function is the tree walk only, with sorted pairs (the OpenZeppelin
 * MerkleProof convention) and an injected pair hash, so 4f plugs in its hash without changing callers.
 */
export type PairHash = (
  left: string,
  right: string
) => string | Promise<string>;

const HEX = /^0x[0-9a-f]+$/;

export function normalizeHex(value: string): string | null {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  const prefixed = v.startsWith("0x") ? v : `0x${v}`;
  return HEX.test(prefixed) ? prefixed : null;
}

export async function verifyMerkleProof(params: {
  leaf: string;
  proof: readonly string[];
  root: string;
  hashPair: PairHash;
}): Promise<boolean> {
  let node = normalizeHex(params.leaf);
  const root = normalizeHex(params.root);
  if (!node || !root) return false;
  for (const step of params.proof) {
    const sibling = normalizeHex(step);
    if (!sibling) return false;
    const [a, b] = node <= sibling ? [node, sibling] : [sibling, node];
    const next = normalizeHex(await params.hashPair(a, b));
    if (!next) return false;
    node = next;
  }
  return node === root;
}

/** `tt:paws:<day>:<root>` memo, as the indexer stores it in full (never the 64-char widget cut). */
export function parsePawMemo(
  memo: string
): { day: string; root: string } | null {
  const m = /^tt:paws:(\d{4}-\d{2}-\d{2}):(0x[0-9a-fA-F]{64})$/.exec(
    String(memo || "")
  );
  return m ? { day: m[1], root: m[2].toLowerCase() } : null;
}
