import { ICollectibleProperty, IToastMessage } from "@/context/ToastContext";

// Paw Legends shows no Tails balance, so a symbol has no picture.
const symbolImage: Partial<Record<ICollectibleProperty, string>> = {};

export const Toast = ({ message, isError, symbol, img }: IToastMessage) => {
  const symbolImg = symbol ? symbolImage[symbol] : null;
  return (
    // Toast layer (500, plan F3.2) sits above sign-in (200), the intro and
    // reveals, so a toast fired from a modal is never hidden behind it.
    // Screen readers get the text from ToastProvider's live region instead,
    // which keeps working while a modal hides the rest of the page.
    <div
      className="fixed z-toast top-32 left-1/2 pointer-events-none"
      style={{ transform: "translateX(-50%)" }}
      data-testid="toast"
      aria-hidden="true"
    >
      <div
        key={message}
        className="animate-bounceWithFade rem:w-[360px] min-h-16 relative flex flex-col items-center justify-center"
      >
        {/* Main toast container */}
        <div
          className={`relative w-full min-h-16 px-4 py-3 rounded-xl glow-box flex flex-col items-center justify-center border-4 ${
            isError ? "border-red-700" : "border-yellow-900"
          }`}
          style={{
            // v6 chrome, no pixel art (founder, Nov 13): a smooth warm gradient, no tiled pixel-paw picture
            backgroundImage: isError
              ? "linear-gradient(160deg, #fff3e3 0%, #ffd6d6 100%)"
              : "linear-gradient(160deg, #fff3e3 0%, #ffe9a8 100%)",
          }}
        >
          {/* Overlay for readability */}
          <div
            className={`absolute inset-0 rounded-xl ${
              isError
                ? "bg-gradient-to-br from-red-200/40 to-red-300/40"
                : "bg-gradient-to-br from-yellow-200/30 to-tt-cream/30"
            }`}
          ></div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-2 w-full">
            {img && (
              <img
                src={img}
                className="w-12 h-12 object-contain drop-shadow-lg"
                draggable={false}
              />
            )}
            <div className="flex items-center gap-2 text-center">
              <div
                className={`text-p4 font-primary uppercase font-bold ${
                  isError ? "text-red-100" : "text-yellow-900"
                }`}
              >
                {message}
              </div>
              {symbolImg && (
                <img
                  src={symbolImg}
                  className="w-6 h-6 drop-shadow-md"
                  draggable={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
