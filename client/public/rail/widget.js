/*! ShelterSplit Rail widget. MIT. No dependencies, no framework.
 *
 * Default mode: the visitor's wallet calls ShelterSplit.donate(memo) with the native coin.
 *
 * <script src="widget.js"
 *   data-chain="5042"
 *   data-split="0xYourShelterSplit"          (or data-deployments="/shelter-payouts/deployments.json")
 *   data-amount="1000000000000000000"        (native wei; on Arc 1e18 = 1 USDC; default 1 USDC)
 *   data-memo="mygame"                        (short, public, no personal data)
 *   data-shelter="Pink Paw"                   (optional: the button reads "Give 1 USDC to Pink Paw")
 *   data-disclosure="Who holds the shelter wallets"
 *   data-from-block="123456"                  (optional log scan start; deployments.json "fromBlock" also works)
 *   data-testnet="true"                       (optional: shows "Test USDC, no real money")
 *   data-theme="dark"                         (optional: light | dark; default follows the visitor)
 *   data-target="#donate"></script>          (optional mount point; default: right after the script)
 *
 * Gasless mode (data-mode="gasless"): the visitor signs one USDC ReceiveWithAuthorization (EIP-3009)
 * and pays no gas. A relay submits it to the DonateRouter, which pulls the USDC from the visitor and
 * pays the shelters through ShelterSplit in the same transaction. The router has no owner, keeps no
 * gift past that transaction and reverts if any part would reach the split's treasury, so the relay
 * never holds the gift.
 *
 *   data-mode="gasless" data-router="0xDonateRouter" data-usdc="0xUSDC" data-relay="https://api/…/relay"
 *   data-amount="1000000"                     (USDC base units, 6 decimals; default 1 USDC)
 *   data-rpc / data-explorer / data-chain-name  (optional, for chains the widget does not know)
 *   data-native-symbol="ETH"                  (optional: that chain's gas coin, for the wallet's add-chain prompt; default ETH)
 * Native mode is USDC-only: it sends the chain's native coin, so on a chain whose native coin is not
 * USDC (anything but Arc, unless data-native-symbol="USDC") it stays off instead of sending ETH or AVAX.
 * Before the button is enabled, the widget reads router.split() and router.usdc() and stays off unless
 * they match the split it shows and data-usdc; before the donor signs, it checks the router's authNonce
 * locally and refuses an unreadable USDC name or version.
 *
 * Renders one button and a live "shelters received" total, read from the chain's public RPC.
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
  var CHAINS = {
    5042: { name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io", symbol: "USDC", decimals: 18 },
    5042002: { name: "Arc Testnet", rpc: "https://rpc.testnet.arc.io", explorer: "https://explorer.testnet.arc.io", symbol: "USDC", decimals: 18, testnet: true },
  };
  var ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  var LOG_WINDOW = 10000;
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

  // Public RPCs cap eth_getLogs ranges: try the whole range, then 10,000-block windows.
  function getLogs(url, address, fromBlock) {
    var filter = function (from, to) {
      return [{ address: address, topics: [[NATIVE_DISBURSED, DISBURSED]], fromBlock: "0x" + from.toString(16), toBlock: to }];
    };
    return rpc(url, "eth_getLogs", filter(fromBlock, "latest")).catch(function () {
      return rpc(url, "eth_blockNumber", []).then(function (hex) {
        var latest = parseInt(hex, 16);
        var starts = [];
        for (var s = fromBlock; s <= latest; s += LOG_WINDOW) starts.push(s);
        if (starts.length > MAX_LOG_REQUESTS) throw new Error("set data-from-block");
        var out = [];
        var i = 0;
        function next() {
          if (i >= starts.length) return out;
          var batch = starts.slice(i, i + 1);
          i += 1;
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

  /** Reads the script tag's data-* attributes into mount options. */
  function readOptions(d) {
    d = d || {};
    var mode = d.mode === "gasless" ? "gasless" : "native";
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
      rpc: d.rpc || null,
      explorer: d.explorer || null,
      chainName: d.chainName || null,
      nativeSymbol: /^[A-Za-z0-9.]{1,12}$/.test(d.nativeSymbol || "") ? d.nativeSymbol : null,
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
    ".total{font-size:13px;color:var(--muted)}.total b{color:var(--fg)}" +
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
        var hit = (Array.isArray(list) ? list : []).filter(function (d) {
          return d && Number(d.chainId) === opts.chainId && ADDRESS_RE.test(d.address || "");
        })[0];
        return hit ? { address: hit.address, fromBlock: Number(opts.fromBlock || hit.fromBlock || 0) } : null;
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
        params: [{ chainId: hexChain, chainName: chain.name, rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer], nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: chain.decimals } }],
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

  function mount(el, opts) {
    opts = opts || {};
    var gasless = opts.mode === "gasless";
    var chainId = Number(opts.chain || 5042);
    var known = CHAINS[chainId];
    // An unknown chain's native coin is ETH unless data-native-symbol says otherwise (never assumed USDC).
    var chain = known || (opts.rpc ? { name: opts.chainName || "chain " + chainId, rpc: opts.rpc, explorer: opts.explorer || "", symbol: opts.nativeSymbol || "ETH", decimals: 18 } : null);
    if (chain && (opts.rpc || opts.explorer)) {
      chain = { name: opts.chainName || chain.name, rpc: opts.rpc || chain.rpc, explorer: opts.explorer || chain.explorer, symbol: chain.symbol, decimals: chain.decimals, testnet: chain.testnet };
    }
    // Native gifts send the native coin, so they are only offered where that coin is USDC (Arc).
    var usdcNative = !!chain && chain.symbol === "USDC";
    // Native gifts use the chain's native decimals (18 on Arc); gasless gifts are USDC base units (6).
    var unitDecimals = gasless ? 6 : chain ? chain.decimals : 18;
    var amount = BigInt(opts.amount || (gasless ? "1000000" : "1000000000000000000"));
    var memo = String(opts.memo || "widget").slice(0, 64);
    var testnet = !!opts.testnet;
    var shadow = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
    if (opts.theme && el.setAttribute) el.setAttribute("data-theme", opts.theme);
    shadow.innerHTML =
      "<style>" + CSS + "</style>" +
      '<div class="card" part="card">' +
      (testnet ? '<span class="chip" part="testnet">Test USDC, no real money</span>' : "") +
      '<button type="button" disabled>Loading…</button>' +
      (gasless ? '<div class="sub">No gas needed. You sign once in your wallet; the gift goes straight to the shelter.</div>' : "") +
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
    var label = opts.label || "Give " + formatUnits(amount, unitDecimals) + " USDC to " + who;

    if (!chain) {
      btn.textContent = "Unsupported chain";
      return;
    }
    if (!gasless && !usdcNative) {
      btn.textContent = "Native giving is USDC-only";
      msg.textContent = "On " + chain.name + " the native coin is " + chain.symbol + ", not USDC. Use the gasless (USDC) mode here.";
      return;
    }
    if (gasless && (!opts.router || !opts.usdc || !opts.relay)) {
      btn.textContent = "Gasless giving opens soon";
      // The status goes in the message line, so the live total keeps its own line.
      msg.textContent = "The DonateRouter for this shelter is not live yet.";
    }

    resolveSplit({ split: opts.split, deployments: opts.deployments, chainId: chainId, fromBlock: opts.fromBlock }).then(function (found) {
      if (!found) {
        btn.textContent = "Donations open soon";
        total.textContent = "The ShelterSplit contract is not deployed on " + chain.name + " yet.";
        return;
      }

      var split = found.address;
      // A total read in the last few minutes comes from sessionStorage, so a reload does not rescan
      // the public RPC. Best effort: storage may be unavailable.
      var cacheKey = "shelter-rail:" + chainId + ":" + split.toLowerCase() + ":" + found.fromBlock;
      function show(value) {
        total.innerHTML = "";
        total.appendChild(document.createTextNode("Shelters received "));
        var b = document.createElement("b");
        b.textContent = formatUnits(value, 18) + " " + (testnet ? "test USDC" : "USDC");
        total.appendChild(b);
        total.appendChild(document.createTextNode(" on " + chain.name));
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
        getLogs(chain.rpc, split, found.fromBlock)
          .then(function (logs) {
            var value = sumPayouts(logs, !usdcNative);
            show(value);
            try { root.sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), total: value.toString() })); } catch (e) { /* no storage */ }
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
    sumNative: sumNative,
    sumPayouts: sumPayouts,
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
