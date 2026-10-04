/**
 * True for the elements of a third-party payment layer that lives outside the dialog: Stripe's
 * card and 3DS iframes, the 3DS challenge container Stripe appends to `<body>`, and the Stellar
 * Wallets Kit modal (a plain `<div>` appended to `<body>`, `z-[999]`). Everything the app renders
 * sits under `#__next` or in a Radix portal, so "outside both" is a third party.
 * (Moved out of PacksModal so the shelter cat checkout can use it without loading the packs store.)
 */
export const isPaymentLayer = (target: Element): boolean => {
  if (target.closest('iframe[name^="__privateStripeFrame"], iframe[src*="js.stripe.com"]')) return true;
  if (target.closest("#__next, [role='dialog'], [data-testid='game-modal-scrim']")) {
    return false;
  }
  return !!target.closest("body > *");
};
