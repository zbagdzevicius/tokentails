import clsx from "clsx";
import type { MouseEvent, ReactElement } from "react";

export type BrandProvider = "google" | "apple";

interface IProps {
  provider: BrandProvider;
  /** Called synchronously from the click, so a popup opened in it is not blocked. */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** Defaults to "Continue with Google" / "Continue with Apple". */
  label?: string;
  className?: string;
}

/** Google's official four-colour "G" (Sign in with Google branding guidelines). */
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false" className="shrink-0">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

/** The Apple logo, white, as Apple's Human Interface Guidelines show it on a black button. */
const AppleMark = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className="shrink-0" fill="#fff">
    <path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" />
  </svg>
);

const VARIANTS: Record<
  BrandProvider,
  { button: string; label: string; mark: () => ReactElement; textClass: string; family: string }
> = {
  // Google "dark" theme: #131314 fill, #8E918F stroke, #E3E3E3 text, Roboto Medium.
  google: {
    button: "bg-[#131314] text-[#E3E3E3] border border-[#8E918F] hover:bg-[#1f1f21]",
    label: "Continue with Google",
    mark: GoogleMark,
    textClass: "font-medium text-[14px] tracking-[0.25px]",
    // Roboto 500 is self-hosted by the typography runtime (task 2d, `fonts.generated.scss`).
    // Brand guidelines fix this face, so it is not a type role.
    family: '"Roboto", Arial, sans-serif',
  },
  // Apple HIG: a solid black button with the white logo and the system font.
  apple: {
    // The same 1 px stroke as Google's dark button, so the pair reads as one set on the night sheet.
    button: "bg-black text-white border border-[#8E918F] hover:bg-[#111]",
    label: "Continue with Apple",
    mark: AppleMark,
    // 15 px SF reads at the same optical size as Google's fixed 14 px Roboto, so the stacked
    // pair looks even; the HIG lets the title size follow the button.
    textClass: "font-medium text-[15px]",
    // Apple's HIG asks for the system font on its button.
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  },
};

/**
 * A provider's own sign-in button (plan G9), unaltered: no game plate or offset shadow (the brand
 * guidelines ask for the plain button, and a gold plate offset to one side read as misregistered
 * against the panel). 4 px radius, 48 px tall like the sheet's other buttons, full column width.
 */
export const BrandSignInButton = ({ provider, onClick, disabled, label, className }: IProps) => {
  const variant = VARIANTS[provider];
  const Mark = variant.mark;
  return (
    <span className={clsx("relative block w-full", className)} data-brand={provider}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={clsx(
          "relative flex h-[48px] min-h-[44px] w-full items-center justify-center gap-[10px] rounded-[4px] px-3 shadow-[0_3px_0_rgb(var(--tt-night-950))] short:!h-[44px]",
          "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-tt-gold-400",
          variant.button
        )}
      >
        <Mark />
        <span
          className={clsx("whitespace-nowrap leading-none", variant.textClass)}
          // eslint-disable-next-line tt/no-raw-font
          style={{ fontFamily: variant.family }}
        >{label ?? variant.label}</span>
      </button>
    </span>
  );
};

export default BrandSignInButton;
