/**
 * Which product the AuthSheet speaks for. On the Paw Legends pages it never names Token Tails
 * (docs/plans/moba/NO-TOKENTAILS.md): plain "Sign in" titles, Paw Legends' own terms and privacy
 * pages, no Tails, no cat to save, no Catnip Heist link.
 */
export type AuthSheetBrand = "tokentails" | "pawlegends";

/**
 * The Paw Legends pages by their Next page path, which is the same on tokentails.com and on
 * pawlegends.app (its rewrites keep the page path: `/play` there is the `/pawlegends/play` page).
 */
export const authBrandFor = (pathname: string | null | undefined): AuthSheetBrand =>
  !!pathname && (pathname === "/pawlegends" || pathname.startsWith("/pawlegends/") || pathname === "/legends")
    ? "pawlegends"
    : "tokentails";
