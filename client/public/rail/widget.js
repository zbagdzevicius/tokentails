/*! ShelterSplit Rail widget. MIT. No dependencies, no framework.
 *
 * Seven chains, mainnet and testnet: Arc (5042 / 5042002), Tempo (4217 / 42431), Arbitrum (42161 /
 * 421614), Avalanche (43114 / 43113), Base (8453 / 84532), Robinhood Chain (4663 / 46630) and Monad
 * (143 / 10143). Three ways to give, picked by data-mode (default "auto"):
 *
 *   native   the visitor's wallet calls ShelterSplit.donate(memo) with the native coin. Only where that
 *            coin is USDC (Arc); elsewhere it would send ETH, AVAX or MON, so it stays off.
 *   token    approve + ShelterSplit.disburse(amount, memo) in the split's own coin (USDC, USDC.e,
 *            pathUSD, USDG, mUSDC), or disburseWithMemo(amount, bytes32 memo) on Tempo. Two wallet
 *            transactions; works for coins without EIP-3009 and on chains without a DonateRouter.
 *   gasless  one EIP-3009 signature to a DonateRouter, submitted by a relay (below).
 *   auto     gasless when data-router, data-usdc and data-relay are all set; else native on Arc; else token.
 *
 * <script src="widget.js"
 *   data-chain="5042"
 *   data-split="0xYourShelterSplit"          (or data-deployments="/shelter-payouts/deployments.json": the
 *                                             newest entry on data-chain paying that chain's own coin)
 *   data-amount="1000000000000000000"        (native mode: native wei, on Arc 1e18 = 1 USDC; token and
 *                                             gasless modes: token base units, 6 decimals, 1000000 = 1)
 *   data-memo="mygame"                        (short, public, no personal data)
 *   data-shelter="Pink Paw"                   (optional: the button reads "Give 1 USDC to Pink Paw")
 *   data-coin="USDC"                          (optional: the coin's symbol, when the chain's default is not it)
 *   data-disclosure="Who holds the shelter wallets"
 *   data-from-block="123456"                  (optional log scan start; deployments.json "fromBlock" works,
 *                                             and so does its "tx": the deploy transaction's block)
 *   data-testnet="true"                       (optional: shows "Test USDC, no real money"; known testnets
 *                                             show it anyway)
 *   data-theme="dark"                         (optional: light | dark; default follows the visitor)
 *   data-index="https://api.tokentails.com"   (optional: a Token Tails backend whose payout index, GET
 *                                             /shelter/payouts, gives the total up to its last indexed
 *                                             block; only newer blocks are then read from the chain.
 *                                             Older than 15 minutes or unreachable: the chain alone)
 *   data-target="#donate"></script>          (optional mount point; default: right after the script)
 *
 * Gasless mode (data-mode="gasless"): the visitor signs one USDC ReceiveWithAuthorization (EIP-3009)
 * and pays no gas. A relay submits it to the DonateRouter, which pulls the USDC from the visitor and
 * pays the shelters through ShelterSplit in the same transaction. The router has no owner, keeps no
 * gift past that transaction and reverts if any part would reach the split's treasury, so the relay
 * never holds the gift. Tempo's TIP-20 coins, USDG and mUSDC have no EIP-3009: use token mode there.
 *
 *   data-mode="gasless" data-router="0xDonateRouter" data-usdc="0xUSDC" data-relay="https://api/…/relay"
 *   data-rpc / data-explorer / data-chain-name  (optional, for chains the widget does not know)
 *   data-native-symbol="ETH"                  (optional: that chain's gas coin, for the wallet's add-chain prompt; default ETH)
 * Before the button is enabled, the widget reads router.split() and router.usdc() and stays off unless
 * they match the split it shows and data-usdc; before the donor signs, it checks the router's authNonce
 * locally and refuses an unreadable USDC name or version. In token mode it reads split.token() and
 * approves exactly the gift for that token.
 *
 * Renders one button and a "shelters received" total of the split's public payout events, read from the
 * chain's public RPC (or from data-index plus the newest blocks).
 */
(function (root) {
  "use strict";

  var SELECTOR = "b5aebc80"; // donate(string)
  var AUTH_NONCE = "8a7ae4e2"; // authNonce(bytes32,string,bytes32)
  var CAN_DONATE = "dd8fca6a"; // canDonate(uint256)
  var RECIPIENTS_HASH = "bd8e8b98"; // recipientsHash(uint256)
  var ROUTER_SPLIT = "0xf7654176"; // split()
  var ROUTER_USDC = "0x3e413bee"; // usdc()
  var NAME = "0x06fdde03"; // name()
  var VERSION = "0x54fd4d50"; // version()
  var DOMAIN_SEPARATOR = "0x3644e515"; // DOMAIN_SEPARATOR()
  var DOMAIN_TYPEHASH = "8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f";
  var NATIVE_DISBURSED = "0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef";
  var DISBURSED = "0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a";
  var APPROVE = "095ea7b3"; // approve(address,uint256)
  var ALLOWANCE = "dd62ed3e"; // allowance(address,address)
  var DISBURSE = "c950e7d9"; // ShelterSplit.disburse(uint256,string)
  var DISBURSE_WITH_MEMO = "970a3255"; // ShelterSplit.disburseWithMemo(uint256,bytes32), Tempo only
  var SPLIT_TOKEN = "0xfc0c546a"; // ShelterSplit.token()
  var NO_NATIVE_COIN = "No native coin (fees in USD stablecoins)";
  // symbol/decimals: the native (gas) coin. coin: the chain's own payout token. Mirrors CHAINS in sdk.mjs.
  var CHAINS = {
    5042: { name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io", symbol: "USDC", decimals: 18, coin: { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", eip3009: true } },
    5042002: { name: "Arc Testnet", rpc: "https://rpc.testnet.arc.io", logRpc: "https://rpc.blockdaemon.testnet.arc.network", logRange: 100000, explorer: "https://explorer.testnet.arc.io", symbol: "USDC", decimals: 18, testnet: true, coin: { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", eip3009: true } },
    4217: { name: "Tempo", rpc: "https://rpc.tempo.xyz", logRange: 99999, explorer: "https://explore.tempo.xyz", symbol: "USD", decimals: 18, noNative: true, memo32: true, coin: { symbol: "USDC.e", address: "0x20C000000000000000000000b9537d11c60E8b50", eip3009: false } },
    42431: { name: "Tempo Testnet", rpc: "https://rpc.moderato.tempo.xyz", explorer: "https://explore.testnet.tempo.xyz", symbol: "USD", decimals: 18, noNative: true, memo32: true, testnet: true, coin: { symbol: "pathUSD", address: "0x20c0000000000000000000000000000000000000", eip3009: false } },
    42161: { name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", symbol: "ETH", decimals: 18, coin: { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", eip3009: true } },
    421614: { name: "Arbitrum Sepolia", rpc: "https://sepolia-rollup.arbitrum.io/rpc", explorer: "https://sepolia.arbiscan.io", symbol: "ETH", decimals: 18, testnet: true, coin: { symbol: "USDC", address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", eip3009: true } },
    43114: { name: "Avalanche C-Chain", rpc: "https://api.avax.network/ext/bc/C/rpc", explorer: "https://subnets.avax.network/c-chain", symbol: "AVAX", decimals: 18, coin: { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", eip3009: true } },
    43113: { name: "Avalanche Fuji", rpc: "https://api.avax-test.network/ext/bc/C/rpc", explorer: "https://subnets-test.avax.network/c-chain", symbol: "AVAX", decimals: 18, testnet: true, coin: { symbol: "USDC", address: "0x5425890298aed601595a70AB815c96711a31Bc65", eip3009: true } },
    8453: { name: "Base", rpc: "https://mainnet.base.org", logRange: 500, explorer: "https://basescan.org", symbol: "ETH", decimals: 18, coin: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", eip3009: true } },
    84532: { name: "Base Sepolia", rpc: "https://sepolia.base.org", logRpc: "https://base-sepolia-rpc.publicnode.com", logRange: 10000, explorer: "https://sepolia.basescan.org", symbol: "ETH", decimals: 18, testnet: true, coin: { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", eip3009: true } },
    4663: { name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com", symbol: "ETH", decimals: 18, coin: { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", eip3009: false } },
    46630: { name: "Robinhood Chain Testnet", rpc: "https://rpc.testnet.chain.robinhood.com", explorer: "https://explorer.testnet.chain.robinhood.com", symbol: "ETH", decimals: 18, testnet: true, coin: { symbol: "mUSDC", address: "0x457c89e10a6e66633eda5bf82fd086febb5db147", eip3009: false } },
    143: { name: "Monad", rpc: "https://rpc.monad.xyz", logRpc: "https://rpc1.monad.xyz", logRange: 100000, explorer: "https://monadvision.com", symbol: "MON", decimals: 18, coin: { symbol: "USDC", address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", eip3009: true } },
    10143: { name: "Monad Testnet", rpc: "https://testnet-rpc.monad.xyz", logRpc: "https://monad-testnet.api.onfinality.io/public", logRange: 10000, explorer: "https://testnet.monadvision.com", symbol: "MON", decimals: 18, testnet: true, coin: { symbol: "USDC", address: "0x534b2f3A21130d7a60830c2Df862319e593943A3", eip3009: true } },
  };
  var ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  var LOG_WINDOW_DEFAULT = 10000;
  var MAX_LOG_REQUESTS = 80;

  function word(n) {
    return BigInt(n).toString(16).padStart(64, "0");
  }

  function utf8Hex(s) {
    var bytes = new TextEncoder().encode(String(s || ""));
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return { hex: hex, length: bytes.length };
  }

  function encodeString(s) {
    var u = utf8Hex(s);
    return word(u.length) + u.hex.padEnd(Math.ceil(u.length / 32) * 64, "0");
  }

  function encodeDonate(memo) {
    if (utf8Hex(memo).length > 256) throw new Error("memo too long");
    return "0x" + SELECTOR + word(32) + encodeString(memo);
  }

  /** Calldata for DonateRouter.authNonce(bytes32 salt, string memo, bytes32 recipients). */
  function encodeAuthNonce(salt, memo, recipients) {
    return "0x" + AUTH_NONCE + salt.slice(2).toLowerCase() + word(96) + recipients.slice(2, 66).toLowerCase() + encodeString(memo);
  }

  function addressWord(a) {
    return String(a).slice(2).toLowerCase().padStart(64, "0");
  }

  /** approve(spender, amount). */
  function encodeApprove(spender, amount) {
    return "0x" + APPROVE + addressWord(spender) + word(amount);
  }

  /** allowance(owner, spender), for an eth_call. */
  function encodeAllowance(owner, spender) {
    return "0x" + ALLOWANCE + addressWord(owner) + addressWord(spender);
  }

  /** ShelterSplit.disburse(uint256 amount, string memo). */
  function encodeDisburse(amount, memo) {
    if (utf8Hex(memo).length > 256) throw new Error("memo too long");
    return "0x" + DISBURSE + word(amount) + word(64) + encodeString(memo);
  }

  /** A short memo as bytes32: its UTF-8 bytes right-padded (at most 32), or a 0x 32-byte hex as it is. */
  function memoToBytes32(memo) {
    var s = String(memo == null ? "" : memo);
    if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
    var u = utf8Hex(s);
    if (u.length > 32) throw new Error("memo too long for bytes32");
    return "0x" + u.hex.padEnd(64, "0");
  }

  /** ShelterSplit.disburseWithMemo(uint256 amount, bytes32 memo): Tempo TIP-20. */
  function encodeDisburseWithMemo(amount, memo) {
    return "0x" + DISBURSE_WITH_MEMO + word(amount) + memoToBytes32(memo).slice(2);
  }

  // Keccak-256 (the Ethereum hash), the same algorithm as the SDK: lets the widget check the router's
  // authNonce locally before the donor signs.
  var MASK64 = (BigInt(1) << BigInt(64)) - BigInt(1);
  var RC = [
    "0000000000000001", "0000000000008082", "800000000000808a", "8000000080008000", "000000000000808b", "0000000080000001",
    "8000000080008081", "8000000000008009", "000000000000008a", "0000000000000088", "0000000080008009", "000000008000000a",
    "000000008000808b", "800000000000008b", "8000000000008089", "8000000000008003", "8000000000008002", "8000000000000080",
    "000000000000800a", "800000008000000a", "8000000080008081", "8000000000008080", "0000000080000001", "8000000080008008",
  ].map(function (h) { return BigInt("0x" + h); });
  var ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  function rotl(x, n) { return n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64; }
  function keccakF(st) {
    for (var round = 0; round < 24; round++) {
      var c = [], x, y;
      for (x = 0; x < 5; x++) c[x] = st[x] ^ st[x + 5] ^ st[x + 10] ^ st[x + 15] ^ st[x + 20];
      for (x = 0; x < 5; x++) {
        var d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
        for (y = 0; y < 25; y += 5) st[x + y] ^= d;
      }
      var b = new Array(25);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(st[x + 5 * y], ROT[x + 5 * y]);
      for (x = 0; x < 5; x++) for (y = 0; y < 25; y += 5) st[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK64 & b[((x + 2) % 5) + y]);
      st[0] ^= RC[round];
    }
  }
  /** keccak256 of bytes (Uint8Array) or a 0x hex string; returns 0x hex. */
  function keccak256(input) {
    var bytes = input;
    if (typeof input === "string") {
      var h = input.slice(2);
      bytes = new Uint8Array(h.length / 2);
      for (var j = 0; j < bytes.length; j++) bytes[j] = parseInt(h.substr(j * 2, 2), 16);
    }
    var rate = 136;
    var padded = new Uint8Array(Math.floor(bytes.length / rate) * rate + rate);
    padded.set(bytes);
    padded[bytes.length] ^= 0x01;
    padded[padded.length - 1] ^= 0x80;
    var st = [];
    for (var z = 0; z < 25; z++) st[z] = BigInt(0);
    for (var off = 0; off < padded.length; off += rate) {
      for (var i = 0; i < rate / 8; i++) {
        var lane = BigInt(0);
        for (var k = 7; k >= 0; k--) lane = (lane << BigInt(8)) | BigInt(padded[off + i * 8 + k]);
        st[i] ^= lane;
      }
      keccakF(st);
    }
    var out = "";
    for (var q = 0; q < 4; q++) for (var r = 0; r < 8; r++) out += Number((st[q] >> BigInt(8 * r)) & BigInt(255)).toString(16).padStart(2, "0");
    return "0x" + out;
  }

  /** The router's EIP-3009 nonce: keccak256(abi.encode(router, keccak256(memo), salt, recipients)). */
  function routerAuthNonce(router, salt, memo, recipients) {
    var memoHash = keccak256(new TextEncoder().encode(String(memo)));
    return keccak256(
      "0x" + router.slice(2).toLowerCase().padStart(64, "0") + memoHash.slice(2) + salt.slice(2).toLowerCase() + recipients.slice(2, 66).toLowerCase()
    );
  }

  /** The EIP-712 separator of (name, version, chainId, token). */
  function domainSeparator(name, version, chainId, token) {
    var h = function (t) { return keccak256(new TextEncoder().encode(String(t))).slice(2); };
    return keccak256("0x" + DOMAIN_TYPEHASH + h(name) + h(version) + word(chainId) + String(token).slice(2).toLowerCase().padStart(64, "0"));
  }

  /**
   * The token's EIP-712 version: version(), or for a token without it (USDG on Robinhood Chain signs
   * with "1") the version whose separator matches DOMAIN_SEPARATOR(). Null when neither works.
   */
  function readVersion(call, token, name, chainId) {
    return call(token, VERSION).then(decodeString, function () { return null; }).then(function (v) {
      if (v) return v;
      return call(token, DOMAIN_SEPARATOR).then(function (sep) {
        sep = String(sep || "").slice(0, 66).toLowerCase();
        return ["2", "1"].filter(function (c) { return domainSeparator(name, c, chainId, token) === sep; })[0] || null;
      }, function () { return null; });
    });
  }

  /** The address in a 32-byte ABI return word (lowercased), or null. */
  function decodeAddress(ret) {
    return /^0x[0-9a-fA-F]{64}/.test(String(ret)) ? "0x" + String(ret).slice(26, 66).toLowerCase() : null;
  }

  function decodeString(hex) {
    var h = String(hex || "0x").slice(2);
    if (h.length < 128) return null;
    var off = parseInt(h.slice(0, 64), 16) * 2;
    var len = parseInt(h.slice(off, off + 64), 16) * 2;
    var bytes = new Uint8Array(len / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(off + 64 + i * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  }

  function formatUnits(value, decimals, maxFraction) {
    var v = BigInt(value);
    var base = BigInt(10) ** BigInt(decimals);
    var frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFraction == null ? 2 : maxFraction).replace(/0+$/, "");
    return (v / base).toString() + (frac ? "." + frac : "");
  }

  // Sums the amount word of every NativeDisbursed log.
  function sumNative(logs) {
    var total = BigInt(0);
    (logs || []).forEach(function (l) {
      if ((l.topics && l.topics[0] || "").toLowerCase() === NATIVE_DISBURSED) total += BigInt("0x" + l.data.slice(2, 66));
    });
    return total;
  }

  /**
   * Every payout in 18 decimals: NativeDisbursed (native, 18 decimals) plus Disbursed (USDC token,
   * 6 decimals, scaled up), so a router gift and a native gift add up on one meter.
   */
  function sumPayouts(logs, tokenOnly) {
    var total = BigInt(0);
    var scale = BigInt(10) ** BigInt(12);
    (logs || []).forEach(function (l) {
      var t = (l.topics && l.topics[0] || "").toLowerCase();
      var amount = BigInt("0x" + (l.data || "0x").slice(2, 66));
      // tokenOnly: the native coin is not USDC (ETH, AVAX), so native payouts are never added in.
      if (t === NATIVE_DISBURSED) total += tokenOnly ? BigInt(0) : amount;
      else if (t === DISBURSED) total += amount * scale;
    });
    return total;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // Public RPCs rate-limit bursts (HTTP 429): back off and retry a few times.
  function rpc(url, method, params, attempt) {
    attempt = attempt || 0;
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
    }).then(function (r) {
      if (r.status === 429 && attempt < 6) return sleep(700 * Math.pow(2, attempt)).then(function () { return rpc(url, method, params, attempt + 1); });
      return r.json().then(function (b) {
        if (b.error) throw new Error(b.error.message || "RPC error");
        return b.result;
      });
    });
  }

  // Public RPCs cap eth_getLogs ranges: try the whole range, then `windowSize`-block windows (default 10,000).
  function getLogs(url, address, fromBlock, windowSize) {
    var LOG_WINDOW = windowSize || LOG_WINDOW_DEFAULT;
    var filter = function (from, to) {
      return [{ address: address, topics: [[NATIVE_DISBURSED, DISBURSED]], fromBlock: "0x" + from.toString(16), toBlock: to }];
    };
    // A chain known to take only small ranges (Monad: 100 blocks) goes straight to windows.
    var whole = LOG_WINDOW < 1000 ? Promise.reject(new Error("small range")) : rpc(url, "eth_getLogs", filter(fromBlock, "latest"));
    return whole.catch(function () {
      return rpc(url, "eth_blockNumber", []).then(function (hex) {
        var latest = parseInt(hex, 16);
        var starts = [];
        for (var s = fromBlock; s <= latest; s += LOG_WINDOW) starts.push(s);
        // Small windows (Monad's RPC takes 100 blocks) get more requests, four at a time.
        var small = LOG_WINDOW < 1000;
        if (starts.length > (small ? MAX_LOG_REQUESTS * 5 : MAX_LOG_REQUESTS)) throw new Error("set data-from-block");
        var out = [];
        var i = 0;
        function next() {
          if (i >= starts.length) return out;
          var batch = starts.slice(i, i + (small ? 4 : 1));
          i += batch.length;
          return Promise.all(batch.map(function (s) {
            return rpc(url, "eth_getLogs", filter(s, "0x" + Math.min(s + LOG_WINDOW - 1, latest).toString(16)));
          })).then(function (parts) {
            parts.forEach(function (p) { out = out.concat(p || []); });
            return next();
          });
        }
        return next();
      });
    });
  }

  // data-index: the backend's payout index answers up to `indexedThrough`; a contract it has not read
  // within INDEX_STALE_MS is read from the chain instead. Mirrors indexedTotals in sdk.mjs.
  // `lastKnown`: a stale entry comes back too (with `stale: true`), to stand in when the chain is busy.
  var INDEX_STALE_MS = 15 * 60 * 1000;
  function readIndexed(base, network, chainId, split, tokenOnly, lastKnown) {
    base = String(base || "").replace(/\/+$/, "").replace(/\/shelter\/payouts$/, "");
    if (!base || typeof fetch !== "function") return Promise.resolve(null);
    var want = String(split).toLowerCase();
    var url = base + "/shelter/payouts?network=" + network + "&chainId=" + chainId + "&address=" + want + "&limit=1";
    return fetch(url, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        var c = body && Array.isArray(body.contracts) ? body.contracts.filter(function (x) { return x && Number(x.chainId) === chainId && String(x.contract).toLowerCase() === want; })[0] : null;
        var t = c && c.indexedThrough;
        if (!t || typeof t.block !== "number" || typeof t.time !== "number") return null;
        var stale = Date.now() - t.time * 1000 > INDEX_STALE_MS;
        if (stale && !lastKnown) return null;
        var sum = BigInt(0);
        (c.totals || []).forEach(function (x) {
          if (!/^\d{1,78}$/.test(String(x && x.amount18))) throw new Error("bad total");
          // tokenOnly: the native coin is not USDC (ETH, AVAX), as in sumPayouts.
          if (x.kind === "native" && tokenOnly) return;
          sum += BigInt(x.amount18);
        });
        return { through: t.block, time: t.time, total: sum, stale: stale };
      })
      .catch(function () { return null; });
  }

  /** "as of 2 h ago": when the index last read a contract whose chain is busy right now. */
  function asOf(unixSec, nowMs) {
    var s = Math.max(0, Math.round((nowMs === undefined ? Date.now() : nowMs) / 1000 - unixSec));
    if (s < 60) return "as of just now";
    if (s < 3600) return "as of " + Math.floor(s / 60) + " min ago";
    if (s < 86400) return "as of " + Math.floor(s / 3600) + " h ago";
    return "as of " + Math.floor(s / 86400) + " d ago";
  }

  /**
   * The total to show: the index plus the chain's newer blocks, or the chain alone. Never drops the
   * index's total because the chain could not be read: then it resolves { value: index total,
   * updating: indexedThrough time } (a fresh index whose tail failed, or a stale one whose full read
   * failed). Rejects only when there is no index entry and the chain cannot be read.
   */
  function readTotal(ixPromise, scan, fromBlock) {
    return ixPromise.then(function (ix) {
      var fallback = function (err) {
        if (!ix) throw err;
        return { value: ix.total, updating: ix.time };
      };
      if (ix && !ix.stale) {
        // Only the blocks after the index.
        return scan(ix.through + 1).then(function (v) { return { value: ix.total + v, updating: null }; }, fallback);
      }
      return scan(fromBlock).then(function (v) { return { value: v, updating: null }; }, fallback);
    });
  }

  /** Reads the script tag's data-* attributes into mount options. */
  function readOptions(d) {
    d = d || {};
    var mode = d.mode === "gasless" || d.mode === "token" || d.mode === "native" ? d.mode : "auto";
    return {
      mode: mode,
      chain: d.chain,
      split: d.split,
      deployments: d.deployments,
      amount: d.amount,
      memo: d.memo,
      label: d.label,
      shelter: d.shelter,
      disclosure: d.disclosure,
      fromBlock: d.fromBlock,
      testnet: d.testnet === "true",
      theme: d.theme === "light" || d.theme === "dark" ? d.theme : null,
      router: ADDRESS_RE.test(d.router || "") ? d.router : null,
      usdc: ADDRESS_RE.test(d.usdc || "") ? d.usdc : null,
      relay: d.relay || null,
      index: /^https?:\/\//.test(d.index || "") ? d.index : null,
      rpc: d.rpc || null,
      explorer: d.explorer || null,
      chainName: d.chainName || null,
      nativeSymbol: /^[A-Za-z0-9.]{1,12}$/.test(d.nativeSymbol || "") ? d.nativeSymbol : null,
      coin: /^[A-Za-z0-9.]{1,12}$/.test(d.coin || "") ? d.coin : null,
    };
  }

  var CSS =
    ":host{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--bg:#fff;--fg:#1f1b24;--muted:#6b6475;--accent:#e2557a;--accent-fg:#fff;--line:#eadfe4;--chip:#fff4d6;--chip-fg:#6b4b00}" +
    "@media (prefers-color-scheme:dark){:host{--bg:#1c1820;--fg:#f4eef6;--muted:#b4a9bb;--accent:#ff7da0;--accent-fg:#1c1820;--line:#3a3040;--chip:#3a2f10;--chip-fg:#ffd98a}}" +
    ":host([data-theme=light]){--bg:#fff;--fg:#1f1b24;--muted:#6b6475;--accent:#e2557a;--accent-fg:#fff;--line:#eadfe4;--chip:#fff4d6;--chip-fg:#6b4b00}" +
    ":host([data-theme=dark]){--bg:#1c1820;--fg:#f4eef6;--muted:#b4a9bb;--accent:#ff7da0;--accent-fg:#1c1820;--line:#3a3040;--chip:#3a2f10;--chip-fg:#ffd98a}" +
    ".card{position:relative;box-sizing:border-box;display:inline-flex;flex-direction:column;gap:8px;width:100%;max-width:340px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:var(--bg);color:var(--fg)}" +
    "button{font:inherit;font-weight:700;font-size:15px;min-height:44px;padding:10px 16px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-fg);cursor:pointer;transition:transform .12s}" +
    "button:hover{transform:scale(1.03)}button:active{transform:scale(.97)}button[disabled]{opacity:.55;cursor:default;transform:none}" +
    "button:focus-visible{outline:3px solid var(--fg);outline-offset:3px}" +
    ".chip{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.02em;padding:3px 8px;border-radius:999px;background:var(--chip);color:var(--chip-fg)}" +
    ".sub{font-size:12px;color:var(--muted);line-height:1.4}" +
    ".total{font-size:13px;color:var(--muted)}.total b{color:var(--fg)}.total .upd{font-size:11px;font-style:italic}" +
    ".msg{font-size:13px;min-height:1em;line-height:1.4}.msg a{color:var(--accent)}" +
    ".note{font-size:11px;color:var(--muted);line-height:1.35}" +
    ".heart{position:absolute;left:50%;top:30px;pointer-events:none;color:var(--accent);font-size:16px;animation:fly 1.1s ease-out forwards}" +
    "@keyframes fly{from{opacity:1;transform:translate(0,0) scale(.6)}to{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.2)}}" +
    "@media (prefers-reduced-motion:reduce){.heart{display:none}button{transition:none}button:hover,button:active{transform:none}}";

  function celebrate(card) {
    for (var i = 0; i < 12; i++) {
      var h = document.createElement("span");
      h.className = "heart";
      h.setAttribute("aria-hidden", "true");
      h.textContent = "♥";
      var a = (Math.PI * 2 * i) / 12;
      h.style.setProperty("--dx", Math.round(Math.cos(a) * 70) + "px");
      h.style.setProperty("--dy", Math.round(Math.sin(a) * 50 - 20) + "px");
      card.appendChild(h);
      setTimeout(h.remove.bind(h), 1200);
    }
  }

  function resolveSplit(opts) {
    if (ADDRESS_RE.test(opts.split || "")) return Promise.resolve({ address: opts.split, fromBlock: Number(opts.fromBlock || 0) });
    if (!opts.deployments) return Promise.resolve(null);
    return fetch(opts.deployments, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        // The newest split on this chain that pays the wanted coin (a second EURC split is never picked
        // unless data-coin names it); entries without a coin field count as the chain's own coin.
        var hits = (Array.isArray(list) ? list : []).filter(function (d) {
          var sym = d && (d.symbol || d.token);
          return d && Number(d.chainId) === opts.chainId && ADDRESS_RE.test(d.address || "") && (!opts.coin || !sym || String(sym).toLowerCase() === String(opts.coin).toLowerCase()) &&
            (!d.contract || d.contract === "ShelterSplit");
        });
        var hit = hits[hits.length - 1];
        if (!hit) return null;
        var from = Number(opts.fromBlock || hit.fromBlock || 0);
        // No fromBlock: the deploy transaction's block is where the payouts can start.
        if (!from && /^0x[0-9a-fA-F]{64}$/.test(hit.tx || "") && opts.rpc) {
          return rpc(opts.rpc, "eth_getTransactionReceipt", [hit.tx]).then(function (r) {
            return { address: hit.address, fromBlock: r && r.blockNumber ? parseInt(r.blockNumber, 16) : 0 };
          }, function () { return { address: hit.address, fromBlock: 0 }; });
        }
        return { address: hit.address, fromBlock: from };
      })
      .catch(function () { return null; });
  }

  function randomHex(bytes) {
    var a = new Uint8Array(bytes);
    root.crypto.getRandomValues(a);
    var hex = "";
    for (var i = 0; i < a.length; i++) hex += a[i].toString(16).padStart(2, "0");
    return hex;
  }

  function switchChain(eth, chainId, chain) {
    var hexChain = "0x" + chainId.toString(16);
    return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] }).catch(function (err) {
      if (!err || err.code !== 4902) throw err;
      return eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hexChain, chainName: chain.name, rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer], nativeCurrency: { name: chain.noNative ? NO_NATIVE_COIN : chain.symbol, symbol: chain.symbol, decimals: chain.decimals } }],
      });
    });
  }

  /**
   * The donor gives the router pull rights for the gift, so the router must be wired to the split this
   * widget shows and to the USDC it signs for. Rejects with `mismatch` otherwise. `call(to, data)`
   * performs an eth_call (wallet or public RPC).
   */
  function checkRouter(call, router, split, usdc) {
    return Promise.all([call(router, ROUTER_SPLIT), call(router, ROUTER_USDC)]).then(function (r) {
      if (decodeAddress(r[0]) !== String(split).toLowerCase() || decodeAddress(r[1]) !== String(usdc).toLowerCase()) {
        var e = new Error("router");
        e.mismatch = true;
        throw e;
      }
    });
  }

  /**
   * Gasless gift: signs one ReceiveWithAuthorization to the router and posts it to the relay.
   * Resolves with the relay's JSON ({ txHash } when it already broadcast).
   */
  function giveGasless(eth, o) {
    var from;
    var call = function (to, data) { return eth.request({ method: "eth_call", params: [{ to: to, data: data }, "latest"] }); };
    var memo = "tt:wallet:" + randomHex(4);
    var salt = "0x" + randomHex(32);
    var validBefore = Math.floor(Date.now() / 1000) + 300;
    var nonce;
    var recipients;
    var domain = {};
    return eth.request({ method: "eth_requestAccounts" })
      .then(function (accs) {
        from = accs[0];
        return switchChain(eth, o.chainId, o.chain);
      })
      .then(function () { return checkRouter(call, o.router, o.split, o.usdc); })
      .then(function () { return call(o.router, "0x" + CAN_DONATE + word(o.amount)); })
      .then(function (can) {
        if (!can || BigInt("0x" + (can.slice(2, 66) || "0")) !== BigInt(1)) {
          var e = new Error("guard");
          e.guard = true;
          throw e;
        }
        // The payout list the donor signs: the router reverts if it changes before the gift lands.
        return call(o.router, "0x" + RECIPIENTS_HASH + word(o.amount));
      })
      .then(function (rh) {
        if (!/^0x[0-9a-fA-F]{64}/.test(String(rh))) throw new Error("could not read the shelter list");
        recipients = String(rh).slice(0, 66).toLowerCase();
        return Promise.all([call(o.router, encodeAuthNonce(salt, memo, recipients)), call(o.usdc, NAME)]).then(function (r) {
          var name = decodeString(r[1]);
          return readVersion(call, o.usdc, name, o.chainId).then(function (version) { return [r[0], name, version]; });
        });
      })
      .then(function (r) {
        nonce = String(r[0] || "").toLowerCase();
        if (nonce !== routerAuthNonce(o.router, salt, memo, recipients)) {
          var bad = new Error("authNonce");
          bad.mismatch = true;
          throw bad;
        }
        domain = { name: r[1], version: r[2], chainId: o.chainId, verifyingContract: o.usdc };
        if (!domain.name || !domain.version) {
          var noDomain = new Error("domain");
          noDomain.mismatch = true;
          throw noDomain;
        }
        var typed = {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            ReceiveWithAuthorization: [
              { name: "from", type: "address" },
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce", type: "bytes32" },
            ],
          },
          primaryType: "ReceiveWithAuthorization",
          domain: domain,
          message: { from: from, to: o.router, value: o.amount.toString(), validAfter: "0", validBefore: String(validBefore), nonce: nonce },
        };
        return eth.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(typed)] });
      })
      .then(function (signature) {
        return fetch(o.relay, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chainId: o.chainId, from: from, value: o.amount.toString(), validAfter: "0", validBefore: String(validBefore), salt: salt, memo: memo, recipients: recipients, signature: signature }),
        });
      })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) {
            var e = new Error((body && body.message) || "relay error");
            e.relay = true;
            throw e;
          }
          return body || {};
        });
      });
  }

  /** Polls the wallet for a receipt; rejects when it reverted or is not mined in ~2 minutes. */
  function waitMined(eth, hash, tries) {
    tries = tries || 0;
    return eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).then(function (r) {
      if (r) {
        if (r.status !== "0x1") throw new Error("reverted");
        return r;
      }
      if (tries > 80) throw new Error("not mined");
      return sleep(1500).then(function () { return waitMined(eth, hash, tries + 1); });
    });
  }

  /**
   * Token gift straight into ShelterSplit (coins without EIP-3009, chains without a router): reads
   * split.token() (refusing a split that pays another coin than the one shown), approves the split for
   * exactly the gift when the allowance is short and waits for it, then calls disburse(amount, memo),
   * or disburseWithMemo(amount, bytes32 memo) on Tempo. Resolves with the disburse hash.
   */
  function giveToken(eth, o, onStep) {
    var from;
    var token;
    var call = function (to, data) { return eth.request({ method: "eth_call", params: [{ to: to, data: data }, "latest"] }); };
    return eth.request({ method: "eth_requestAccounts" })
      .then(function (accs) {
        from = accs[0];
        return switchChain(eth, o.chainId, o.chain);
      })
      .then(function () { return call(o.split, SPLIT_TOKEN); })
      .then(function (ret) {
        token = decodeAddress(ret);
        if (!token || (o.coinAddress && token !== String(o.coinAddress).toLowerCase())) {
          var e = new Error("coin");
          e.mismatch = true;
          throw e;
        }
        return call(token, encodeAllowance(from, o.split));
      })
      .then(function (ret) {
        var allowance = /^0x[0-9a-fA-F]{64}/.test(String(ret)) ? BigInt(String(ret).slice(0, 66)) : BigInt(0);
        if (allowance >= o.amount) return null;
        if (onStep) onStep("approve");
        return eth.request({ method: "eth_sendTransaction", params: [{ from: from, to: token, data: encodeApprove(o.split, o.amount) }] })
          .then(function (hash) { return waitMined(eth, hash); });
      })
      .then(function () {
        if (onStep) onStep("give");
        var data = o.chain.memo32 ? encodeDisburseWithMemo(o.amount, o.memo) : encodeDisburse(o.amount, o.memo);
        return eth.request({ method: "eth_sendTransaction", params: [{ from: from, to: o.split, data: data }] });
      });
  }

  /** "gasless" | "native" | "token": what `auto` (or an explicit mode) means on this chain. */
  function pickMode(opts, chain) {
    if (opts.mode === "gasless" || opts.mode === "native" || opts.mode === "token") return opts.mode;
    if (opts.router && opts.usdc && opts.relay) return "gasless";
    return chain && chain.symbol === "USDC" ? "native" : "token";
  }

  function mount(el, opts) {
    opts = opts || {};
    var chainId = Number(opts.chain || 5042);
    var known = CHAINS[chainId];
    // An unknown chain's native coin is ETH unless data-native-symbol says otherwise (never assumed USDC).
    var chain = known || (opts.rpc ? { name: opts.chainName || "chain " + chainId, rpc: opts.rpc, explorer: opts.explorer || "", symbol: opts.nativeSymbol || "ETH", decimals: 18 } : null);
    if (chain && (opts.rpc || opts.explorer)) {
      chain = { name: opts.chainName || chain.name, rpc: opts.rpc || chain.rpc, explorer: opts.explorer || chain.explorer, symbol: chain.symbol, decimals: chain.decimals, testnet: chain.testnet, noNative: chain.noNative, memo32: chain.memo32, coin: chain.coin, logRpc: opts.rpc ? null : chain.logRpc, logRange: chain.logRange };
    }
    var mode = pickMode(opts, chain);
    var gasless = mode === "gasless";
    var token = mode === "token";
    // Native gifts send the native coin, so they are only offered where that coin is USDC (Arc).
    var usdcNative = !!chain && chain.symbol === "USDC";
    // The coin shown: data-coin, else the chain's own payout coin (USDC on Arc's native path too).
    var ownCoin = chain && chain.coin;
    var coinSymbol = opts.coin || (ownCoin ? ownCoin.symbol : usdcNative ? "USDC" : gasless ? "USDC" : "tokens");
    var coinAddress = ownCoin && (!opts.coin || opts.coin.toLowerCase() === ownCoin.symbol.toLowerCase()) ? ownCoin.address : null;
    // Native gifts use the chain's native decimals (18 on Arc); token and gasless gifts are base units (6).
    var unitDecimals = gasless || token ? 6 : chain ? chain.decimals : 18;
    var amount = BigInt(opts.amount || (gasless || token ? "1000000" : "1000000000000000000"));
    // Tempo's bytes32 memo holds 32 bytes.
    var memo = String(opts.memo || "widget").slice(0, chain && chain.memo32 ? 32 : 64);
    var testnet = !!opts.testnet || !!(chain && chain.testnet);
    var shadow = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
    if (opts.theme && el.setAttribute) el.setAttribute("data-theme", opts.theme);
    shadow.innerHTML =
      "<style>" + CSS + "</style>" +
      '<div class="card" part="card">' +
      (testnet ? '<span class="chip" part="testnet">Test ' + (coinSymbol === "USDC" ? "USDC" : "coins") + ", no real money</span>" : "") +
      '<button type="button" disabled>Loading…</button>' +
      (gasless ? '<div class="sub">No gas needed. You sign once in your wallet; the gift goes straight to the shelter.</div>' : "") +
      (token ? '<div class="sub">Two steps in your wallet: allow this exact amount, then give. The gift goes straight to the shelter.</div>' : "") +
      '<div class="total" aria-live="polite"></div>' +
      '<div class="msg" role="status" aria-live="polite"></div>' +
      (opts.disclosure ? '<div class="note"></div>' : "") +
      "</div>";
    var card = shadow.querySelector(".card");
    var btn = shadow.querySelector("button");
    var total = shadow.querySelector(".total");
    var msg = shadow.querySelector(".msg");
    if (opts.disclosure) shadow.querySelector(".note").textContent = opts.disclosure;
    var who = opts.shelter ? String(opts.shelter).slice(0, 48) : "shelters";
    var label = opts.label || "Give " + formatUnits(amount, unitDecimals) + " " + coinSymbol + " to " + who;

    if (!chain) {
      btn.textContent = "Unsupported chain";
      return;
    }
    if (mode === "native" && !usdcNative) {
      btn.textContent = "Native giving is USDC-only";
      msg.textContent = "On " + chain.name + " the native coin is " + (chain.noNative ? "none" : chain.symbol) + ", not USDC. Use the token mode here.";
      return;
    }
    if (gasless && ownCoin && ownCoin.eip3009 === false && (!opts.coin || opts.coin === ownCoin.symbol)) {
      btn.textContent = "Gasless giving is not available";
      msg.textContent = ownCoin.symbol + " on " + chain.name + " has no signed-transfer support. Use the token mode here.";
      return;
    }
    if (gasless && (!opts.router || !opts.usdc || !opts.relay)) {
      btn.textContent = "Gasless giving opens soon";
      // The status goes in the message line, so the live total keeps its own line.
      msg.textContent = "The DonateRouter for this shelter is not live yet.";
    }

    resolveSplit({ split: opts.split, deployments: opts.deployments, chainId: chainId, fromBlock: opts.fromBlock, coin: opts.coin || (ownCoin && ownCoin.symbol), rpc: chain.rpc }).then(function (found) {
      if (!found) {
        btn.textContent = "Donations open soon";
        total.textContent = "The ShelterSplit contract is not deployed on " + chain.name + " yet.";
        return;
      }

      var split = found.address;
      // A total read in the last few minutes comes from sessionStorage, so a reload does not rescan
      // the public RPC. Best effort: storage may be unavailable.
      var cacheKey = "shelter-rail:" + chainId + ":" + split.toLowerCase() + ":" + found.fromBlock;
      function show(value, updating) {
        total.innerHTML = "";
        total.appendChild(document.createTextNode("Shelters received "));
        var b = document.createElement("b");
        b.textContent = formatUnits(value, 18) + " " + (testnet && coinSymbol === "USDC" ? "test USDC" : coinSymbol);
        total.appendChild(b);
        total.appendChild(document.createTextNode(" on " + chain.name));
        if (updating) {
          // The index's last-known total while the chain is busy: kept, and said to be last-known.
          var u = document.createElement("span");
          u.className = "upd";
          u.textContent = " · updating, " + asOf(updating);
          total.appendChild(u);
        }
        el.setAttribute && el.setAttribute("data-total-ready", "true");
      }
      function refresh(useCache) {
        if (useCache) {
          try {
            var hit = JSON.parse(root.sessionStorage.getItem(cacheKey) || "null");
            if (hit && Date.now() - hit.at < 300000) return show(BigInt(hit.total));
          } catch (e) { /* no storage */ }
        }
        // Public RPCs may rate-limit (HTTP 429) and the read retries with backoff: say it is coming.
        if (!total.textContent) total.textContent = "Reading the live total from " + chain.name + "…";
        var logRpc = chain.logRpc || chain.rpc;
        var scan = function (from) { return getLogs(logRpc, split, from, chain.logRange).then(function (logs) { return sumPayouts(logs, !usdcNative); }); };
        var ix = opts.index && !opts.rpc
          ? readIndexed(opts.index, testnet ? "testnet" : "mainnet", chainId, split, !usdcNative, true)
          : Promise.resolve(null);
        readTotal(ix, scan, found.fromBlock)
          .then(function (r) {
            show(r.value, r.updating);
            // Only a complete total is cached: an "updating" one is read again on the next view.
            if (r.updating) return;
            try { root.sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), total: r.value.toString() })); } catch (e) { /* no storage */ }
          })
          .catch(function () { total.textContent = "Live total unavailable right now."; });
      }

      refresh(true);
      if (gasless && (!opts.router || !opts.usdc || !opts.relay)) return;

      function enable() {
        btn.textContent = label;
        btn.disabled = false;
      }
      if (gasless) {
        // Only enable gasless giving once the router is known to pay this split with this USDC.
        var publicCall = function (to, data) { return rpc(chain.rpc, "eth_call", [{ to: to, data: data }, "latest"]); };
        checkRouter(publicCall, opts.router, split, opts.usdc).then(enable, function (err) {
          btn.textContent = "Gasless giving is not available";
          msg.textContent = err && err.mismatch
            ? "This button is not wired to the shelter's contract, so it stays off."
            : "Could not check the gift contract right now. Please try again later.";
        });
      } else {
        enable();
      }

      function thanks(hash) {
        celebrate(card);
        msg.innerHTML = "";
        msg.appendChild(document.createTextNode("Thank you! Paws up. "));
        if (hash && chain.explorer) {
          var a = document.createElement("a");
          a.href = chain.explorer + "/tx/" + hash;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = "See it on-chain";
          msg.appendChild(a);
        }
        setTimeout(refresh, 6000);
      }

      btn.addEventListener("click", function () {
        var eth = root.ethereum;
        if (!eth || !eth.request) {
          msg.textContent = "Open this page in a wallet app to give.";
          return;
        }
        btn.disabled = true;
        msg.textContent = gasless ? "Sign in your wallet. No gas needed…" : "Confirm in your wallet…";
        var work = gasless
          ? giveGasless(eth, { chainId: chainId, chain: chain, router: opts.router, usdc: opts.usdc, relay: opts.relay, amount: amount, split: split }).then(function (body) {
              thanks(/^0x[0-9a-fA-F]{64}$/.test(body.txHash || "") ? body.txHash : null);
            })
          : token
          ? giveToken(eth, { chainId: chainId, chain: chain, split: split, amount: amount, memo: memo, coinAddress: coinAddress }, function (step) {
              msg.textContent = step === "approve" ? "Step 1 of 2: allow " + formatUnits(amount, 6) + " " + coinSymbol + " in your wallet…" : "Step 2 of 2: confirm the gift in your wallet…";
            }).then(thanks)
          : eth.request({ method: "eth_requestAccounts" })
              .then(function (accs) {
                var from = accs[0];
                return switchChain(eth, chainId, chain).then(function () {
                  return eth.request({ method: "eth_sendTransaction", params: [{ from: from, to: split, value: "0x" + amount.toString(16), data: encodeDonate(memo) }] });
                });
              })
              .then(thanks);
        work
          .catch(function (err) {
            msg.textContent =
              err && err.code === 4001
                ? "No worries, nothing was sent."
                : err && err.guard
                ? "Gifts can't reach the shelter right now, so nothing was signed."
                : err && err.mismatch
                ? "The gift contract did not check out, so nothing was signed."
                : err && err.relay
                ? String(err.message).slice(0, 160)
                : "That did not go through, so nothing was sent.";
          })
          .then(function () { btn.disabled = false; });
      });
    });
  }

  root.ShelterRail = {
    encodeDonate: encodeDonate,
    encodeAuthNonce: encodeAuthNonce,
    keccak256: keccak256,
    routerAuthNonce: routerAuthNonce,
    decodeAddress: decodeAddress,
    checkRouter: checkRouter,
    decodeString: decodeString,
    domainSeparator: domainSeparator,
    readVersion: readVersion,
    formatUnits: formatUnits,
    encodeApprove: encodeApprove,
    encodeAllowance: encodeAllowance,
    encodeDisburse: encodeDisburse,
    encodeDisburseWithMemo: encodeDisburseWithMemo,
    memoToBytes32: memoToBytes32,
    giveToken: giveToken,
    pickMode: pickMode,
    CHAINS: CHAINS,
    sumNative: sumNative,
    sumPayouts: sumPayouts,
    getLogs: getLogs,
    readIndexed: readIndexed,
    readTotal: readTotal,
    asOf: asOf,
    resolveSplit: resolveSplit,
    readOptions: readOptions,
    mount: mount,
  };

  var script = root.document && root.document.currentScript;
  if (script && script.dataset) {
    var d = script.dataset;
    var host = d.target ? root.document.querySelector(d.target) : null;
    if (!host) {
      host = root.document.createElement("div");
      script.parentNode.insertBefore(host, script.nextSibling);
    }
    mount(host, readOptions(d));
  }
})(typeof window !== "undefined" ? window : globalThis);
