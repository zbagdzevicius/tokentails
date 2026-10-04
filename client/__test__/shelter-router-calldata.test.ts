/**
 * DonateRouter calldata, authNonce and the EIP-3009 typed data, pinned against Foundry (`cast sig`,
 * `cast calldata`, `cast keccak`, the router's own authNonce on an Arc testnet fork) and against a
 * ReceiveWithAuthorization signed by anvil's public dev account #0 (no private key in this file).
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  AUTH_NONCE_SELECTOR,
  CAN_DONATE_SELECTOR,
  DISBURSE_SELECTOR,
  DONATE_NATIVE_CHECKED_SELECTOR,
  DONATE_NATIVE_SELECTOR,
  DONATE_WITH_AUTH_SELECTOR,
  RECIPIENTS_HASH_SELECTOR,
  decodeBytes32,
  encodeRecipientsHashCall,
  authNonce,
  decodeAbiString,
  decodeCanDonate,
  encodeAuthNonceCall,
  encodeCanDonateCall,
  encodeDisburseCalldata,
  encodeDonateNativeCalldata,
  encodeDonateWithAuthorizationCalldata,
  receiveWithAuthorizationDigest,
  receiveWithAuthorizationTypedData,
  recipientsHashOf,
} from "@/components/shelter-payouts/calldata";
import { keccakUtf8, toChecksumAddress } from "@/components/shelter-payouts/keccak";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const nobleSel = (sig: string) => "0x" + hex(keccak_256(new TextEncoder().encode(sig))).slice(0, 8);

const DEV0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // anvil's public dev account #0
const ROUTER = "0xd2e7B19b3E98aa73aF70482CaC5e9C6e5A962823"; // a fork deploy of DonateRouter
// router.recipientsHash(5000000) on that fork: the testnet split pays 100% to Pink Paw's test wallet.
const RECIPIENTS = "0x821ef135b14b0cc580aeb2119dec8a8f3bf5862e05b5327420fa9e0c1d55825b";
const NONCE = "0xda072d84a0b149a7923a9a7b84614088c0a0e39f44cf2b7e520c07c92e618653";
const USDC = "0x3600000000000000000000000000000000000000"; // Arc testnet USDC
const SALT = "0x" + "11".repeat(32);
const MEMO = "tt:wallet:0a1b2c3d";

describe("inline keccak256", () => {
  it("matches @noble/hashes across block boundaries", () => {
    for (const s of ["", "abc", "x".repeat(135), "x".repeat(136), "x".repeat(137), "ė".repeat(200)]) {
      expect(keccakUtf8(s)).toBe("0x" + hex(keccak_256(new TextEncoder().encode(s))));
    }
  });

  it("checksums addresses like EIP-55 (cast to-check-sum-address)", () => {
    expect(toChecksumAddress("0xe299299b846ba629f5a591dbf4f562bcc07a0f37")).toBe(
      "0xE299299b846Ba629f5A591dBF4F562bcC07A0f37"
    );
    expect(toChecksumAddress(DEV0.toLowerCase())).toBe(DEV0);
    expect(() => toChecksumAddress("0x1234")).toThrow();
  });
});

describe("router selectors", () => {
  it.each([
    [DONATE_NATIVE_SELECTOR, "donateNative(string)", "0x416f3ac4"],
    [DISBURSE_SELECTOR, "disburse(uint256,string)", "0xc950e7d9"],
    [DONATE_NATIVE_CHECKED_SELECTOR, "donateNative(string,bytes32)", "0xcf1f2d13"],
    [AUTH_NONCE_SELECTOR, "authNonce(bytes32,string,bytes32)", "0x8a7ae4e2"],
    [RECIPIENTS_HASH_SELECTOR, "recipientsHash(uint256)", "0xbd8e8b98"],
    [CAN_DONATE_SELECTOR, "canDonate(uint256)", "0xdd8fca6a"],
    [
      DONATE_WITH_AUTH_SELECTOR,
      "donateWithAuthorization((address,uint256,uint256,uint256,bytes32,bytes32),string,bytes)",
      "0x6b115c74",
    ],
  ])("%s is keccak(%s) and cast sig", (selector, sig, cast) => {
    expect(selector).toBe(nobleSel(sig));
    expect(selector).toBe(cast);
  });
});

describe("router calldata (cast calldata vectors)", () => {
  it("donateNative(string)", () => {
    expect(encodeDonateNativeCalldata(MEMO)).toBe(
      "0x416f3ac40000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a30613162326333640000000000000000000000000000"
    );
  });

  it("disburse(uint256,string)", () => {
    expect(encodeDisburseCalldata(BigInt(1000000), "tt:match:12345678")).toBe(
      "0xc950e7d900000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001174743a6d617463683a3132333435363738000000000000000000000000000000"
    );
  });

  it("donateNative(string,bytes32), the checked form", () => {
    expect(encodeDonateNativeCalldata(MEMO, RECIPIENTS)).toBe(
      "0xcf1f2d130000000000000000000000000000000000000000000000000000000000000040821ef135b14b0cc580aeb2119dec8a8f3bf5862e05b5327420fa9e0c1d55825b000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a30613162326333640000000000000000000000000000"
    );
  });

  it("authNonce(bytes32,string,bytes32), recipientsHash(uint256) and canDonate(uint256)", () => {
    expect(encodeAuthNonceCall(SALT, MEMO, RECIPIENTS)).toBe(
      "0x8a7ae4e211111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000060821ef135b14b0cc580aeb2119dec8a8f3bf5862e05b5327420fa9e0c1d55825b000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a30613162326333640000000000000000000000000000"
    );
    expect(encodeRecipientsHashCall(BigInt(5000000))).toBe(
      "0xbd8e8b9800000000000000000000000000000000000000000000000000000000004c4b40"
    );
    expect(decodeBytes32(RECIPIENTS.toUpperCase().replace("0X", "0x"))).toBe(RECIPIENTS);
    expect(encodeCanDonateCall(BigInt(5000000))).toBe(
      "0xdd8fca6a00000000000000000000000000000000000000000000000000000000004c4b40"
    );
  });

  it("donateWithAuthorization(gift tuple, memo, signature)", () => {
    const sig = "0x" + "ab".repeat(65);
    expect(
      encodeDonateWithAuthorizationCalldata(
        { from: DEV0, value: "5000000", validAfter: 0, validBefore: 1790000000, salt: SALT, memo: MEMO, recipients: RECIPIENTS },
        sig
      )
    ).toBe(
      "0x6b115c74000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000004c4b400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006ab13b801111111111111111111111111111111111111111111111111111111111111111821ef135b14b0cc580aeb2119dec8a8f3bf5862e05b5327420fa9e0c1d55825b00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a306131623263336400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041ababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab00000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("decodes string and canDonate return data", () => {
    const usdc =
      "0x0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000004" +
      "5553444300000000000000000000000000000000000000000000000000000000";
    expect(decodeAbiString(usdc)).toBe("USDC");
    expect(decodeCanDonate("0x" + "0".repeat(63) + "1" + "0".repeat(64))).toEqual({ ok: true, toTreasury: BigInt(0) });
    expect(decodeCanDonate("0x" + "0".repeat(64) + "0".repeat(62) + "64")).toEqual({ ok: false, toTreasury: BigInt(100) });
  });
});

describe("authNonce", () => {
  it("equals keccak256(abi.encode(router, keccak256(memo), salt, recipients)), as the router computes it", () => {
    // `cast call <router> "authNonce(bytes32,string,bytes32)(bytes32)"` on the fork.
    expect(authNonce(ROUTER, SALT, MEMO, RECIPIENTS)).toBe(NONCE);
    expect(authNonce(ROUTER.toLowerCase(), SALT, MEMO, RECIPIENTS)).toBe(NONCE);
  });

  it("changes when the memo, the salt, the payout list or the router changes", () => {
    expect(authNonce(ROUTER, SALT, "tt:wallet:ffffffff", RECIPIENTS)).not.toBe(NONCE);
    expect(authNonce(ROUTER, "0x" + "22".repeat(32), MEMO, RECIPIENTS)).not.toBe(NONCE);
    expect(authNonce(ROUTER, SALT, MEMO, "0x" + "00".repeat(32))).not.toBe(NONCE);
    expect(authNonce(USDC, SALT, MEMO, RECIPIENTS)).not.toBe(NONCE);
  });
});

describe("ReceiveWithAuthorization typed data", () => {
  const domain = { name: "USDC", version: "2", chainId: 5042002, verifyingContract: USDC };
  const auth = {
    from: DEV0.toLowerCase(),
    value: "5000000",
    validAfter: 0,
    validBefore: 1790000000,
    salt: SALT,
    memo: MEMO,
    recipients: RECIPIENTS,
  };

  it("pays the router, with the bound nonce and decimal-string numbers", () => {
    const td = receiveWithAuthorizationTypedData(domain, ROUTER.toLowerCase(), auth);
    expect(td.primaryType).toBe("ReceiveWithAuthorization");
    expect(td.domain).toEqual({ name: "USDC", version: "2", chainId: 5042002, verifyingContract: USDC });
    expect(td.message).toEqual({
      from: DEV0,
      to: ROUTER,
      value: "5000000",
      validAfter: "0",
      validBefore: "1790000000",
      nonce: NONCE,
    });
    expect(td.types.ReceiveWithAuthorization.map((f) => `${f.type} ${f.name}`).join(",")).toBe(
      "address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce"
    );
  });

  // Signed with anvil's eth_signTypedData_v4 by unlocked dev account #0 on an Arc testnet fork; the
  // fork's USDC DOMAIN_SEPARATOR() was 0x3611…c6b0 for this domain.
  const SIGNATURE =
    "0xd91ed7fd60f31e017316445c55f80086de78432367b9d4703e4dff3cc70c192854b8e4519eb8124a9b89f2870bb35c603de2aae6a14c730dd7ee9ebe6106e3e41c";

  it("hashes to the digest that dev account #0 signed", () => {
    const digest = receiveWithAuthorizationDigest(domain, ROUTER, auth);
    const bytes = Buffer.from(SIGNATURE.slice(2), "hex");
    const sig = secp256k1.Signature.fromCompact(bytes.subarray(0, 64)).addRecoveryBit(bytes[64] - 27);
    const pub = sig.recoverPublicKey(digest.slice(2)).toRawBytes(false);
    const signer = "0x" + hex(keccak_256(pub.subarray(1))).slice(24);
    expect(toChecksumAddress(signer)).toBe(DEV0);
  });

  it("uses the token's on-chain domain separator", () => {
    const ds = keccak_256(
      Buffer.from(
        [
          keccakUtf8("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)").slice(2),
          keccakUtf8("USDC").slice(2),
          keccakUtf8("2").slice(2),
          (5042002).toString(16).padStart(64, "0"),
          USDC.slice(2).padStart(64, "0"),
        ].join(""),
        "hex"
      )
    );
    expect("0x" + hex(ds)).toBe("0x361191522483d32a83e70ae7183b4b9629442c13a78bc9921d6f707911c8c6b0");
  });
});

describe("recipientsHashOf (DonateRouter.recipientsHash, computed locally)", () => {
  it("matches keccak256(abi.encode(address[], uint256[])) from `cast abi-encode` + `cast keccak`", () => {
    // Vectors: cast keccak $(cast abi-encode "f(address[],uint256[])" "[0x77..77,0x88..88]" "[600000,400000]")
    expect(
      recipientsHashOf(["0x" + "77".repeat(20), "0x" + "88".repeat(20)], [BigInt(600000), BigInt(400000)])
    ).toBe("0xe8c8d73779926a5fd2476c1891f75ec6b854b2fe9e1195d2e47fdf1ee1278754");
    expect(recipientsHashOf([], [])).toBe("0xc6df19a9e5cc2e1575f8bc5ee97cc5b352e49114c858bb010d9874784ccd5fc7");
  });

  it("refuses mismatched lengths", () => {
    expect(() => recipientsHashOf(["0x" + "77".repeat(20)], [])).toThrow();
  });
});
