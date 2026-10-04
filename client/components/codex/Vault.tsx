import type { TokenStatus } from "@/api/token-status-api";
import { TAILS_NO_CASH_VALUE } from "@/shared-contracts/copy";
import { Countdown } from "../shared/Countdown";

/**
 * The VAULT tab (plan G5 "Vault", decision #39). It exists only on the web and only while
 * `GET /user/token-status` says TOKEN; app builds never render it and never ask (see
 * client/api/token-status-api.ts). With TAILS_TOKEN_MODE unset (the default, POINTS) no player
 * ever sees this file. Its wording waits for counsel review of the Vault notice, so it states
 * only the date the backend publishes and that nothing changes before the terms are out.
 *
 * Tone-exempt by path (tools/copy-lint `**\/*Vault*.{ts,tsx}`), as the plan allows for the Vault.
 */
export const Vault = ({ status }: { status: TokenStatus }) => (
  <section
    data-testid="vault-tab"
    aria-labelledby="vault-title"
    data-tone="highlight"
    className="tt-card flex w-full flex-col items-center gap-3 p-4 text-center text-tt-cream"
  >
    <h3 id="vault-title" className="font-primary text-p3 uppercase text-tt-gold-400">
      The Vault
    </h3>
    {status.tgeAt ? (
      <>
        <p className="font-sans text-p5 font-semibold">The Vault opens on the date below. The terms are published before then.</p>
        <div className="w-full max-w-[640px] p-3">
          <Countdown targetDate={status.tgeAt} isDaysDisplayed size="lg" />
        </div>
      </>
    ) : (
      <p className="font-sans text-p5 font-semibold">The Vault opening date is not set yet. The terms are published first.</p>
    )}
    <p className="font-sans text-p6 font-semibold text-tt-muted">Until then: {TAILS_NO_CASH_VALUE}</p>
  </section>
);

export default Vault;
