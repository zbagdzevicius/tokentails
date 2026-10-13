// statement-html: renders a Match Desk statement (statement.json, v2: one section per sponsor and a desk
// total) as one self-contained page.
// Inline CSS and JS, no external requests; the data is embedded as <script type="application/json"
// id="statement">. Everything is rendered here, so the page reads without JavaScript; the script only
// powers the "Verify hash" buttons (SHA-256 over the same canonical JSON as log.mjs canonical()).
// The only links are the chain explorer and tokentails.com. Output is a pure function of the statement.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** JSON safe inside a <script> element: no "</script", no HTML comment openers, no line separators. */
const scriptJson = (v) => JSON.stringify(v)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const micro = (m) => {
  const v = BigInt(m);
  const frac = (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (v / 1000000n).toString() + (frac ? '.' + frac : '');
};

const short = (h) => (typeof h === 'string' && h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : String(h ?? ''));

const STATUS_TEXT = {
  reconciled: 'Reconciled: read back from the chain',
  sent: 'Sent: waiting for the chain read-back',
  planned: 'Planned: not sent yet',
  failed: 'Failed: the transaction reverted',
  expired: 'Expired: never sent',
  'skipped-duplicate': 'Skipped: already on-chain',
  mismatch: 'Mismatch: the on-chain amount differs',
};

const KIND_TEXT = {
  public: 'public gift',
  x402: 'x402 payment',
  'router-native': 'gift via DonateRouter',
  'router-authorization': 'gasless gift via DonateRouter',
  treat: "a player's free treat (paid by Token Tails), matched by the sponsor",
};

const OPERATOR = "operator's own money";
const whoIs = (s) => (s.label === OPERATOR ? `${s.name}, with the ${s.label}` : `${s.name}, a ${s.label}`);
const list = (xs) => (xs.length <= 1 ? `${xs.join('')},` : xs.length === 2 ? `${xs[0]}, and ${xs[1]},` : `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]},`);

function link(explorer, kind, value, text) {
  if (!value) return '<span class="muted">not set</span>';
  const label = esc(text ?? short(value));
  if (!explorer) return `<code title="${esc(value)}">${label}</code>`;
  return `<a href="${esc(`${explorer}/${kind}/${value}`)}" rel="noopener" title="${esc(value)}"><code>${label}</code></a>`;
}

function receiptCard(env, st) {
  const ex = st.chain.explorer;
  const r = env.receipt;
  const sp = st.sponsors.find((x) => x.id === r.sponsor);
  const counted = env.status === 'reconciled' && !st.excluded.some((x) => x.sha256 === env.sha256);
  const tx = env.witness?.tx || env.tx?.hash || null;
  const gifts = r.gifts.map((g) => `
          <tr>
            <td data-l="Gift">${link(ex, 'tx', g.tx, short(g.tx))}<div class="muted small">${esc(KIND_TEXT[g.kind] || g.kind)} · ${esc(g.day)}</div></td>
            <td data-l="Donor">${g.donor === 'treats' ? 'free treats' : link(ex, 'address', g.donor)}</td>
            <td data-l="Gift" class="num">${esc(micro(g.giftMicro))}</td>
            <td data-l="Match" class="num">${esc(micro(g.matchMicro))}</td>
          </tr>`).join('');
  return `
      <article class="card receipt" id="r-${esc(env.sha256.slice(0, 16))}">
        <div class="row between">
          <div>
            <div class="amount">${esc(micro(r.amountMicro))} <span class="unit">USDC</span></div>
            <span class="pill ${counted ? 'ok' : env.status === 'sent' || env.status === 'planned' ? 'wait' : 'bad'}">${esc(STATUS_TEXT[env.status] || env.status)}</span>
            ${r.clampedBy ? `<span class="pill">capped by ${esc(r.clampedBy)}</span>` : ''}
          </div>
          <div class="right small muted">${esc(env.mode)}${env.createdAt ? ` · ${esc(env.createdAt.replace('T', ' ').slice(0, 16))} UTC` : ''}</div>
        </div>
        <dl class="kv">
          <dt>Paid from</dt><dd>${esc(sp ? sp.name : r.sponsor)}'s vault ${link(ex, 'address', r.spender)}</dd>
          <dt>Memo</dt><dd><code>${esc(env.memo)}</code></dd>
          <dt>Transaction</dt><dd>${tx ? link(ex, 'tx', tx) : '<span class="muted">none</span>'}</dd>
          <dt>Receipt SHA-256</dt><dd><code class="wrap">${esc(env.sha256)}</code></dd>
        </dl>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Gift</th><th>Donor</th><th class="num">Gift USDC</th><th class="num">Match USDC</th></tr></thead>
            <tbody>${gifts}
            </tbody>
          </table>
        </div>
        ${env.decision?.rationale ? `<p class="small"><span class="muted">Claude's reason:</span> ${esc(env.decision.rationale)}</p>` : ''}
        <div class="row">
          <button type="button" class="verify" data-sha="${esc(env.sha256)}">Verify hash</button>
          <span class="verify-out small" aria-live="polite"></span>
        </div>
      </article>`;
}

const CSS = `
:root{--bg:#fbf7f9;--surface:#ffffff;--ink:#22161c;--muted:#6f5d66;--line:#ead9e1;--accent:#c2306f;--accent-ink:#ffffff;--ok:#1f7a4d;--ok-bg:#e3f4ea;--wait:#8a5a00;--wait-bg:#fbf0d9;--bad:#a1263a;--bad-bg:#fbe4e8;--code:#f4ecf0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17111a;--surface:#211a25;--ink:#f3e9ef;--muted:#b6a3ae;--line:#3a2e3f;--accent:#f16da5;--accent-ink:#1a0d14;--ok:#7fd8a6;--ok-bg:#163526;--wait:#f0c46b;--wait-bg:#3a2d12;--bad:#ff8fa0;--bad-bg:#3d1820;--code:#2c2331}}
:root[data-theme="dark"]{--bg:#17111a;--surface:#211a25;--ink:#f3e9ef;--muted:#b6a3ae;--line:#3a2e3f;--accent:#f16da5;--accent-ink:#1a0d14;--ok:#7fd8a6;--ok-bg:#163526;--wait:#f0c46b;--wait-bg:#3a2d12;--bad:#ff8fa0;--bad-bg:#3d1820;--code:#2c2331}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.7rem;line-height:1.2;margin:0 0 6px}
h2{font-size:1.1rem;margin:32px 0 10px}
p{margin:8px 0}
a{color:var(--accent)}
code{font:0.86em/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:5px}
code.wrap{word-break:break-all}
.muted{color:var(--muted)}
.small{font-size:.86rem}
.lede{color:var(--muted);max-width:60ch}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0}
.notice{border-left:4px solid var(--accent)}
.notice strong{display:block;font-size:1.05rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}
.stat .v{font-size:1.4rem;font-weight:650;font-variant-numeric:tabular-nums}
.stat .k{color:var(--muted);font-size:.82rem}
h3{font-size:1.05rem;margin:0 0 4px}
.card.sponsor .grid{margin:10px 0}
ul.disc{margin:0;padding-left:20px}
ul.disc li{margin:6px 0}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:12px 0;min-width:0}
dl.kv dt{color:var(--muted);font-size:.86rem}
dl.kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.between{justify-content:space-between;align-items:flex-start}
.right{text-align:right}
.amount{font-size:1.5rem;font-weight:700;font-variant-numeric:tabular-nums}
.unit{font-size:.9rem;color:var(--muted);font-weight:500}
.pill{display:inline-block;font-size:.78rem;padding:2px 9px;border-radius:999px;background:var(--code);color:var(--muted);margin:4px 6px 0 0}
.pill.ok{background:var(--ok-bg);color:var(--ok)}
.pill.wait{background:var(--wait-bg);color:var(--wait)}
.pill.bad{background:var(--bad-bg);color:var(--bad)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{text-align:left;padding:7px 6px;border-top:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:.8rem;border-top:0}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
button.verify{font:inherit;font-size:.88rem;background:var(--accent);color:var(--accent-ink);border:0;border-radius:9px;padding:7px 13px;cursor:pointer}
button.verify:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.verify-out.ok{color:var(--ok)}
.verify-out.bad{color:var(--bad)}
footer{margin-top:40px;color:var(--muted);font-size:.86rem}
@media (max-width:560px){
  h1{font-size:1.4rem}
  dl.kv{grid-template-columns:1fr}
  dl.kv dt{margin-top:4px}
  table thead{display:none}
  table,tbody,tr,td{display:block;width:100%}
  tr{border-top:1px solid var(--line);padding:6px 0}
  td{border:0;padding:3px 0;text-align:left}
  td.num{text-align:left}
  td[data-l]::before{content:attr(data-l) ": ";color:var(--muted);font-size:.8rem}
  td:first-child::before{content:none}
}`;

// The browser twin of log.mjs canonical(): keys sorted, JSON.stringify for primitives, arrays in order.
const JS = `
(function(){
  var data = JSON.parse(document.getElementById('statement').textContent);
  var byHash = {};
  (data.receipts || []).forEach(function(e){ byHash[e.sha256] = e; });
  function canonical(v){
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function(k){ return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function hex(buf){ return Array.prototype.map.call(new Uint8Array(buf), function(b){ return b.toString(16).padStart(2, '0'); }).join(''); }
  document.querySelectorAll('button.verify').forEach(function(btn){
    btn.addEventListener('click', function(){
      var out = btn.parentNode.querySelector('.verify-out');
      var env = byHash[btn.getAttribute('data-sha')];
      out.className = 'verify-out small';
      if (!env) { out.textContent = 'Receipt not found in the embedded data.'; return; }
      if (!(window.crypto && crypto.subtle)) { out.textContent = 'This browser cannot hash here (needs a secure page).'; return; }
      var bytes = new TextEncoder().encode(canonical(env.receipt));
      crypto.subtle.digest('SHA-256', bytes).then(function(d){
        var h = hex(d);
        var memoOk = env.memo === 'tt:agent:m:' + env.receipt.sponsor + ':' + h.slice(0, 8);
        if (h === env.sha256 && memoOk) {
          out.className = 'verify-out small ok';
          out.textContent = 'Hash matches. The on-chain memo carries its first 8 characters: ' + h.slice(0, 8) + '.';
        } else {
          out.className = 'verify-out small bad';
          out.textContent = 'Hash differs: computed ' + h.slice(0, 16) + '…, receipt says ' + String(env.sha256).slice(0, 16) + '…';
        }
      }, function(err){ out.textContent = 'Could not hash: ' + err; });
    });
  });
})();`;

function sponsorCard(sp, st) {
  const ex = st.chain.explorer;
  const t = sp.totals;
  const oc = sp.onchain;
  const deployed = Boolean(sp.vault.spender);
  const chainNote = deployed ? 'not read from the chain for this statement' : 'not deployed yet';
  const stats = [
    ['Funded by the company', oc ? `${oc.fundedUsdc} USDC` : '–'],
    ['Matched (reconciled)', `${t.reconciledUsdc} USDC`],
    ['Float left in the vault', oc && oc.floatLeftUsdc != null ? `${oc.floatLeftUsdc} USDC` : '–'],
    ['Pending', `${t.pendingUsdc} USDC`],
    ['Receipts counted', String(t.receipts)],
    ['Gifts matched', String(t.giftsMatched)],
  ].map(([k, v]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`).join('');
  return `
    <article class="card sponsor" id="s-${esc(sp.id)}">
      <h3>${esc(sp.name)}</h3>
      <p class="small"><span class="pill">${esc(sp.label)}</span>${deployed ? '' : '<span class="pill wait">Not deployed yet</span>'}</p>
      <div class="grid">${stats}</div>
      ${oc ? `<p class="small muted">Read from the chain: funded ${esc(oc.fundedUsdc)}, taken back by the company ${esc(oc.withdrawnUsdc)}, given by the agent ${esc(oc.givenUsdc)} USDC (every give, matched or not).</p>`
    : `<p class="small muted">Funded and float left: ${esc(chainNote)}.</p>`}
      <dl class="kv">
        <dt>Match vault (CappedSpender)</dt><dd>${link(ex, 'address', sp.vault.spender)}</dd>
        <dt>Vault owner (${esc(sp.name)})</dt><dd>${link(ex, 'address', sp.vault.owner)} <span class="small muted">(only the owner can fund it or take the float back)</span></dd>
        <dt>Ratio</dt><dd>${esc(sp.policy.ratio)}</dd>
        <dt>Most per match</dt><dd>${esc(sp.policy.perGiftMaxUsdc)} USDC</dd>
        <dt>Budget</dt><dd>${esc(sp.policy.budgetUsdc)} USDC</dd>
        <dt>Match order</dt><dd>priority ${esc(sp.priority)}</dd>
        <dt>Policy SHA-256</dt><dd><code class="wrap">${esc(sp.policy.policySha256)}</code></dd>
      </dl>
    </article>`;
}

export function renderHtml(st) {
  const ex = st.chain.explorer;
  const sponsors = st.sponsors;
  const many = sponsors.length > 1;
  const deployedAll = sponsors.every((s) => Boolean(s.vault.spender));
  const deployedAny = sponsors.some((s) => Boolean(s.vault.spender));
  const t = st.totals;
  const custodyShort = st.shelter.custody === 'held-by-shelter' ? 'held by the shelter' : 'held by Token Tails until the handover';
  // Present tense only once a match has been read back from the chain; before that, say what will happen.
  const live = deployedAny && t.receipts > 0;
  const who = list(sponsors.map((s) => esc(whoIs(s))));
  const where = `public gifts to ${esc(st.shelter.name)} on ${esc(st.chain.name)}`;
  const their = many ? 'their match vaults' : 'its match vault';
  const agentLine = many
    ? ' One AI agent holds spending power over every vault, inside on-chain caps, and can pay only the shelter wallet through ShelterSplit.'
    : '';
  const intro = (live
    ? `${who} ${many ? 'match' : 'matches'} ${where}.${agentLine} Claude proposes each match, code ${many ? 'picks the paying vault and ' : ''}checks the amount against the written policy, and a capped contract pays it.`
    : !deployedAny
      ? `${who} will match ${where} once ${their} ${many ? 'are' : 'is'} deployed and funded.${agentLine} Claude will propose each match, code will ${many ? 'pick the paying vault and ' : ''}check the amount against the written policy, and a capped contract will pay it.`
      : `${who} will match ${where} through ${their}. No match has been read back from the chain yet.${agentLine} Claude proposes each match, code ${many ? 'picks the paying vault and ' : ''}checks the amount against the written policy, and a capped contract pays it.`);
  const names = sponsors.map((s) => `${s.name} (${s.label})`).join(' and ');
  const metaLead = live ? `${names} ${many ? 'match' : 'matches'} public gifts to ${st.shelter.name}.` : `${names} will match public gifts to ${st.shelter.name}.`;

  const notice = !deployedAny
    ? `<div class="card notice"><strong>Not deployed yet. No matches.</strong><p class="small muted">The match ${many ? 'vaults are' : 'vault is'} not on-chain yet. This page fills in from receipts once ${many ? 'they are' : 'it is'}.</p></div>`
    : t.receipts === 0
      ? `<div class="card notice"><strong>No reconciled matches yet.</strong><p class="small muted">A match appears in the totals once its AgentGift event has been read back from the chain.${deployedAll ? '' : ' Some vaults are not deployed yet.'}</p></div>`
      : '';

  const stats = [
    ['Paid to the shelter wallet (reconciled matches)', `${t.paidToShelterUsdc} USDC`],
    ['Funded by the companies', t.fundedUsdc != null ? `${t.fundedUsdc} USDC` : '–'],
    ['Float left in the vaults', t.floatLeftUsdc != null ? `${t.floatLeftUsdc} USDC` : '–'],
    ['Pending', `${t.pendingUsdc} USDC`],
    ['Receipts counted', String(t.receipts)],
    ['Gifts matched', String(t.giftsMatched)],
    ['Donors', String(t.donors)],
    ['Gifts matched, value', `${t.giftsMatchedUsdc} USDC`],
  ].map(([k, v]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`).join('');

  const days = st.days.length
    ? `<div class="card table-wrap"><table><thead><tr><th>Day (UTC)</th><th class="num">Matched USDC</th><th class="num">Receipts</th></tr></thead><tbody>${
      st.days.map((d) => `<tr><td data-l="Day">${esc(d.day)}</td><td data-l="Matched USDC" class="num">${esc(d.reconciledUsdc)}</td><td data-l="Receipts" class="num">${esc(d.receipts)}</td></tr>`).join('')
    }</tbody></table></div>`
    : '<p class="muted">No reconciled days yet.</p>';

  const receipts = st.receipts.length
    ? st.receipts.map((e) => receiptCard(e, st)).join('')
    : '<p class="muted">No receipts yet.</p>';

  const excluded = st.excluded.length
    ? `<h2>Excluded</h2><p class="small muted">These receipts failed a check and are not counted.</p><ul class="small">${
      st.excluded.map((x) => `<li><code>${esc(x.sha256 ? short(x.sha256) : 'no hash')}</code>: ${esc(x.reason)}</li>`).join('')
    }</ul>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Match Desk Statement</title>
<meta name="description" content="${esc(`${metaLead} Every match has a receipt you can verify. Not a tax receipt.`)}">
<style>${CSS}
</style>
</head>
<body>
<main>
  <header>
    <p class="small muted">Token Tails · Match Desk · ${esc(st.chain.name)}</p>
    <h1>Match Desk Statement</h1>
    <p class="lede">${intro}</p>
  </header>
  ${notice}
  <h2>Read this first</h2>
  <div class="card"><ul class="disc">
${st.disclosures.map((d) => `    <li>${esc(d)}</li>`).join('\n')}
  </ul></div>

  <h2>Desk total</h2>
  <div class="grid">${stats}</div>
  <p class="small muted">Only reconciled receipts count. Sent and freshly planned receipts show as pending; failed, expired, duplicate and mismatched receipts are listed but never counted. Every match goes through ShelterSplit to the shelter wallet.${st.verifiedOnchain ? ' Reconciled receipts, funding and float were re-checked against the chain when this statement was built.' : !st.receipts.length ? '' : ' Not re-checked against the chain: these totals come from the receipt files; each reconciled receipt links its tx, so you can check it yourself.'}</p>

  <h2>${many ? 'Sponsors' : 'Sponsor'}</h2>
  ${many ? '<p class="small muted">Each company has its own vault. Code picks the paying vault for each match: the highest priority first that can pay the whole amount. One match is paid by one vault.</p>' : ''}
  ${sponsors.map((sp) => sponsorCard(sp, st)).join('')}

  <h2>Shared rules and wallets</h2>
  <div class="card"><dl class="kv">
    <dt>Most per donor per UTC day</dt><dd>${esc(st.policy.perDonorDailyMaxUsdc)} USDC${many ? ', across all sponsors' : ''} (enforced by the agent's code)</dd>
    <dt>Agent wallet${many ? ' (every vault)' : ''}</dt><dd>${link(ex, 'address', st.contract.agent)}</dd>
    <dt>ShelterSplit</dt><dd>${link(ex, 'address', st.contract.split)}</dd>
    <dt>${esc(st.shelter.name)}</dt><dd>${link(ex, 'address', st.shelter.wallet)} <span class="small muted">(${esc(custodyShort)})</span></dd>
  </dl></div>

  <h2>By day</h2>
  ${days}

  <h2>Receipts</h2>
  <p class="small muted">Newest first. "Verify hash" recomputes the receipt's SHA-256 in your browser; its first 8 characters are the end of the on-chain memo.</p>
  ${receipts}
  ${excluded}

  <footer>
    <p>This statement is not a tax receipt.${st.generatedAt ? ` Generated ${esc(st.generatedAt)}.` : ''}</p>
    <p><a href="https://tokentails.com/shelter-payouts">Every shelter payout on tokentails.com</a></p>
  </footer>
</main>
<script type="application/json" id="statement">${scriptJson(st)}</script>
<script>${JS}
</script>
</body>
</html>
`;
}
