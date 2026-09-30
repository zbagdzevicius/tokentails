/*! ShelterSplit Rail widget. MIT. No dependencies, no framework.
 *
 * <script src="widget.js"
 *   data-chain="5042"
 *   data-split="0xYourShelterSplit"          (or data-deployments="/shelter-payouts/deployments.json")
 *   data-amount="1000000000000000000"        (wei; on Arc 1e18 = 1 USDC; default 1 USDC)
 *   data-memo="mygame"                        (short, public, no personal data)
 *   data-disclosure="Who holds the shelter wallets"
 *   data-from-block="123456"                  (optional log scan start; deployments.json "fromBlock" also works)
 *   data-target="#donate"></script>          (optional mount point; default: right after the script)
 *
 * Renders one button and a live "shelters received" total, read from the chain's public RPC.
 */
(function (root) {
  "use strict";

  var SELECTOR = "b5aebc80"; // donate(string)
  var NATIVE_DISBURSED = "0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef";
  var CHAINS = {
    5042: { name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io", symbol: "USDC", decimals: 18 },
    5042002: { name: "Arc Testnet", rpc: "https://rpc.testnet.arc.io", explorer: "https://explorer.arc.io", symbol: "USDC", decimals: 18 },
  };
  var ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

  function word(n) {
    return BigInt(n).toString(16).padStart(64, "0");
  }

  function encodeDonate(memo) {
    var bytes = new TextEncoder().encode(String(memo || ""));
    if (bytes.length > 256) throw new Error("memo too long");
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    var padTo = Math.ceil(bytes.length / 32) * 64;
    return "0x" + SELECTOR + word(32) + word(bytes.length) + hex.padEnd(padTo, "0");
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

  function rpc(url, method, params) {
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (b.error) throw new Error(b.error.message || "RPC error");
        return b.result;
      });
  }

  var CSS =
    ":host{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--bg:#fff;--fg:#1f1b24;--muted:#6b6475;--accent:#e2557a;--accent-fg:#fff;--line:#eadfe4}" +
    "@media (prefers-color-scheme:dark){:host{--bg:#1c1820;--fg:#f4eef6;--muted:#b4a9bb;--accent:#ff7da0;--accent-fg:#1c1820;--line:#3a3040}}" +
    ".card{position:relative;display:inline-flex;flex-direction:column;gap:6px;max-width:320px;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--fg)}" +
    "button{font:inherit;font-weight:700;font-size:15px;padding:10px 16px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-fg);cursor:pointer;transition:transform .12s}" +
    "button:hover{transform:scale(1.03)}button:active{transform:scale(.97)}button[disabled]{opacity:.55;cursor:default;transform:none}" +
    ".total{font-size:13px;color:var(--muted)}.total b{color:var(--fg)}" +
    ".msg{font-size:13px;min-height:1em}.msg a{color:var(--accent)}" +
    ".note{font-size:11px;color:var(--muted);line-height:1.35}" +
    ".heart{position:absolute;left:50%;top:30px;pointer-events:none;color:var(--accent);font-size:16px;animation:fly 1.1s ease-out forwards}" +
    "@keyframes fly{from{opacity:1;transform:translate(0,0) scale(.6)}to{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.2)}}" +
    "@media (prefers-reduced-motion:reduce){.heart{display:none}button{transition:none}}";

  function celebrate(card) {
    for (var i = 0; i < 12; i++) {
      var h = document.createElement("span");
      h.className = "heart";
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

  function mount(el, opts) {
    var chainId = Number(opts.chain || 5042);
    var chain = CHAINS[chainId];
    var amount = BigInt(opts.amount || "1000000000000000000");
    var memo = String(opts.memo || "widget").slice(0, 64);
    var shadow = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
    shadow.innerHTML =
      "<style>" + CSS + "</style>" +
      '<div class="card" part="card">' +
      '<button type="button" disabled>Loading…</button>' +
      '<div class="total" aria-live="polite"></div>' +
      '<div class="msg" role="status"></div>' +
      (opts.disclosure ? '<div class="note"></div>' : "") +
      "</div>";
    var card = shadow.querySelector(".card");
    var btn = shadow.querySelector("button");
    var total = shadow.querySelector(".total");
    var msg = shadow.querySelector(".msg");
    if (opts.disclosure) shadow.querySelector(".note").textContent = opts.disclosure;
    var label = opts.label || "Give " + formatUnits(amount, chain ? chain.decimals : 18) + " " + (chain ? chain.symbol : "") + " to shelters";

    if (!chain) {
      btn.textContent = "Unsupported chain";
      return;
    }

    resolveSplit({ split: opts.split, deployments: opts.deployments, chainId: chainId, fromBlock: opts.fromBlock }).then(function (found) {
      if (!found) {
        btn.textContent = "Donations open soon";
        total.textContent = "The ShelterSplit contract is not deployed on " + chain.name + " yet.";
        return;
      }

      var split = found.address;
      function refresh() {
        rpc(chain.rpc, "eth_getLogs", [{ address: split, topics: [NATIVE_DISBURSED], fromBlock: "0x" + found.fromBlock.toString(16), toBlock: "latest" }])
          .then(function (logs) {
            total.innerHTML = "";
            total.appendChild(document.createTextNode("Shelters received "));
            var b = document.createElement("b");
            b.textContent = formatUnits(sumNative(logs), chain.decimals) + " " + chain.symbol;
            total.appendChild(b);
            total.appendChild(document.createTextNode(" on " + chain.name));
          })
          .catch(function () { total.textContent = "Live total unavailable right now."; });
      }

      btn.textContent = label;
      btn.disabled = false;
      refresh();

      btn.addEventListener("click", function () {
        var eth = root.ethereum;
        if (!eth || !eth.request) {
          msg.textContent = "Open this page in a wallet app to give.";
          return;
        }
        btn.disabled = true;
        msg.textContent = "Confirm in your wallet…";
        var hexChain = "0x" + chainId.toString(16);
        var from;
        eth.request({ method: "eth_requestAccounts" })
          .then(function (accs) {
            from = accs[0];
            return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] }).catch(function (err) {
              if (!err || err.code !== 4902) throw err;
              return eth.request({
                method: "wallet_addEthereumChain",
                params: [{ chainId: hexChain, chainName: chain.name, rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer], nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: chain.decimals } }],
              });
            });
          })
          .then(function () {
            return eth.request({ method: "eth_sendTransaction", params: [{ from: from, to: split, value: "0x" + amount.toString(16), data: encodeDonate(memo) }] });
          })
          .then(function (hash) {
            celebrate(card);
            msg.innerHTML = "";
            msg.appendChild(document.createTextNode("Thank you! Paws up. "));
            var a = document.createElement("a");
            a.href = chain.explorer + "/tx/" + hash;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = "See it on-chain";
            msg.appendChild(a);
            setTimeout(refresh, 6000);
          })
          .catch(function (err) {
            msg.textContent = err && err.code === 4001 ? "No worries, nothing was sent." : "That did not go through, so nothing was sent.";
          })
          .then(function () { btn.disabled = false; });
      });
    });
  }

  root.ShelterRail = { encodeDonate: encodeDonate, formatUnits: formatUnits, sumNative: sumNative, mount: mount };

  var script = root.document && root.document.currentScript;
  if (script && script.dataset) {
    var d = script.dataset;
    var host = d.target ? root.document.querySelector(d.target) : null;
    if (!host) {
      host = root.document.createElement("div");
      script.parentNode.insertBefore(host, script.nextSibling);
    }
    mount(host, { chain: d.chain, split: d.split, deployments: d.deployments, amount: d.amount, memo: d.memo, label: d.label, disclosure: d.disclosure, fromBlock: d.fromBlock });
  }
})(typeof window !== "undefined" ? window : globalThis);
