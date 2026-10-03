import { cdnFile } from "@/constants/utils";
import { ICollectibleProperty, IToastMessage } from "@/context/ToastContext";

const symbolImage: Record<ICollectibleProperty, string> = {
  tails: cdnFile("logo/logo.webp"),
};

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
        {/* Pixel-style side borders */}
        <div className="h-6 w-1 bg-yellow-900 absolute -left-1 top-1/2 -translate-y-1/2"></div>
        <div className="h-8 w-1 bg-yellow-800 absolute -left-2 top-1/2 -translate-y-1/2"></div>
        <div className="h-6 w-1 bg-yellow-900 absolute -right-1 top-1/2 -translate-y-1/2"></div>
        <div className="h-8 w-1 bg-yellow-800 absolute -right-2 top-1/2 -translate-y-1/2"></div>

        {/* Main toast container */}
        <div
          className={`relative w-full min-h-16 px-4 py-3 rounded-xl glow-box flex flex-col items-center justify-center border-4 ${
            isError ? "border-red-700" : "border-yellow-900"
          }`}
          style={{
            backgroundImage: `url(${cdnFile(
              "pixel-rescue/images/bg-paws.webp"
            )})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
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
