import type { Frame, Page } from "@playwright/test";

/**
 * Runtime copy scan (plan F11 "runtime layer", task 7b). The static copy lint (tools/copy-lint)
 * reads the source; it cannot see copy the backend sends or text assembled at run time. This scan
 * reads what the player actually sees on the page: the visible text plus the accessible names
 * (`aria-label`, `alt`, `title`, `placeholder`) of visible elements, and checks it against the
 * same rule families as docs/CLAIMS.md:
 *
 *   tone (R9)     no $TAILS, airdrop, TGE, listing, MNT, allocation or token(s)
 *   rate (R8)     no "Tails per" and no Tails-to-money rate
 *   app (R10)     app builds only: no USDC, 0x hashes, explorer, wallet, chain names or "on-chain"
 *
 * The brand name ("Token Tails") and sign-in tokens ("App Check token") are not tone findings,
 * as in the static lint.
 */

export interface CopyFinding {
  rule: "R8" | "R9" | "R10";
  match: string;
  context: string;
}

const TONE = /\$TAILS|\bairdrops?\b|\bTGE\b|\blistings?\b|\bMNT\b|\ballocations?\b|\btokens?\b/gi;
const RATE = /\bTails per\b|\b\d[\d,.]*\s*Tails\s*=\s*[$€£]?\s*\d|\b\d[\d,.]*\s*(?:USDC|USD|EUR|\$)\s*=\s*\d[\d,.]*\s*Tails\b/gi;
// Case-insensitive words, then case-sensitive chain names ("Arc" the chain, not "arcade").
const APP_WORDS = /\bUSDC\b|\b0x[0-9a-f]{6,}|\bexplorers?\b|\bwallets?\b|\bon-?chain\b/gi;
const APP_CHAINS = /\b(?:Arc|Stellar|Arbitrum|Avalanche|Monad|Mezo|SEI|Solana|Ethereum|Polygon|Tempo)\b/g;
/** Text that names the brand or an auth token, not a crypto token. */
const NOT_TONE = /\bToken Tails\b|\bTokenTails\b|\bApp Check token\b|\bID token\b/gi;

/** Visible copy on the page (or inside `root`), one string per text run or accessible name. */
export async function visibleCopy(page: Page | Frame, root?: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const scope = selector ? document.querySelector(selector) : document.body;
    if (!scope) return [];
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const out: string[] = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("script,style,noscript,nextjs-portal")) continue;
      if (visible(parent)) out.push(text);
    }
    scope.querySelectorAll("[aria-label],[alt],[title],[placeholder]").forEach((el) => {
      if (!visible(el)) return;
      for (const attr of ["aria-label", "alt", "title", "placeholder"]) {
        const value = el.getAttribute(attr);
        if (value && value.trim()) out.push(value.trim());
      }
    });
    return out;
  }, root ?? null);
}

/** Findings in `texts` under the web rules, plus the app rules when `app` is true. */
export function scanCopy(texts: readonly string[], options: { app: boolean }): CopyFinding[] {
  const findings: CopyFinding[] = [];
  const add = (rule: CopyFinding["rule"], re: RegExp, text: string, source = text) => {
    for (const m of source.matchAll(re)) findings.push({ rule, match: m[0], context: text.slice(0, 160) });
  };
  for (const text of texts) {
    add("R9", TONE, text, text.replace(NOT_TONE, " "));
    add("R8", RATE, text);
    if (options.app) {
      add("R10", APP_WORDS, text);
      add("R10", APP_CHAINS, text);
    }
  }
  return findings;
}

/** One line per finding, for `expect(...).toEqual([])`. */
export async function copyFindings(page: Page | Frame, where: string, options: { app: boolean; root?: string }): Promise<string[]> {
  const texts = await visibleCopy(page, options.root);
  return scanCopy(texts, options).map((f) => `${where}: ${f.rule} "${f.match}" in "${f.context}"`);
}
