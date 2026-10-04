import { IMAGE_API, SignInRequiredError } from "@/api/image-api";
import { trackEvent } from "@/components/GoogleTagManager";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ActionRow, ModalButton, ModalSection, StatusPill } from "@/components/ui/modal";
import { ProgressBar } from "./ProgressCards";
import { ProgressStylePickerModal } from "@/components/codex/ProgressStylePickerModal";
import { StripePayment } from "@/components/web3/StripePayment";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { Web3Transfer } from "@/components/web3/transfer/Web3Transfer";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import { AppCheckoutNotice } from "@/components/web3/AppCheckoutNotice";
import { isApp } from "@/models/app";
import { IMessage } from "@/models/cats";
import { EntityType } from "@/models/save";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";

const DIGITAL_PORTRAIT_PRICE = 6;

const STYLE_LABELS: Record<PortraitStyle, string> = {
  [PortraitStyle.HIGHNESS]: "Highness",
  [PortraitStyle.MONARCH]: "Monarch",
  [PortraitStyle.ARISTOCRAT]: "Aristocrat",
  [PortraitStyle.COMMANDER]: "Commander",
};

const PET_ART_FLOW_STEPS = [
  {
    title: "Upload a photo",
    detail: "One clear, well-lit photo of your pet works best.",
    icon: "image",
    eta: "10 s",
  },
  {
    title: "Pick a style",
    detail: "Generate the portrait and try again until it looks like your pet.",
    icon: "sparkles",
    eta: "about 45 s",
  },
  {
    title: "Keep it",
    detail: "Pay by card or crypto to get the full portrait and play as your pet.",
    icon: "gift",
    eta: "5 s",
  },
] as const;

type PaymentMethod = "stripe" | "crypto";

/**
 * The photo drop zone in the night style: a dashed gold pixel edge, Nunito copy and a secondary
 * UPLOAD PHOTO button; the preview keeps a clear (X) button. Tap anywhere, pick a file or drop one.
 */
const PetPhotoZone = ({
  onImageUpload,
  uploadedImage,
  onClear,
}: {
  onImageUpload: (file: File) => void;
  uploadedImage: string | null;
  onClear: () => void;
}) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const take = useCallback(
    (file: File | undefined) => {
      if (file && file.type.startsWith("image/")) onImageUpload(file);
    },
    [onImageUpload]
  );

  if (uploadedImage) {
    return (
      <div className="relative mx-auto w-full max-w-sm overflow-hidden [box-shadow:0_0_0_2px_rgb(var(--tt-gold-500)/0.6)]">
        <img src={uploadedImage} alt="Your pet photo" className="aspect-[3/4] w-full object-cover" />
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove photo"
          className="absolute right-2 top-2 flex h-[44px] w-[44px] items-center justify-center bg-tt-night-950/85 text-tt-cream [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500))] hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-tt-gold-400"
        >
          <PixelIcon name="close" size={18} />
        </button>
        <p className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-tt-night-950 to-transparent px-3 pb-2 pt-6 font-sans text-p6 font-bold uppercase tracking-wider text-tt-cream">
          <PixelIcon name="sparkles" size={12} className="text-tt-gold-400" /> Photo ready
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files[0]);
      }}
      data-testid="pet-photo-zone"
      className={clsx(
        "flex flex-col items-center gap-3 px-4 py-6 text-center transition-colors motion-reduce:transition-none",
        "border-2 border-dashed",
        dragging ? "border-tt-gold-400 bg-tt-gold-400/10" : "border-tt-gold-500/60 bg-tt-night-950/45"
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center bg-tt-night-950/70 text-tt-gold-400 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-gold-500)/0.6)]"
      >
        <PixelIcon name={dragging ? "image" : "paw"} size={24} />
      </span>
      <div>
        <p className="font-sans text-p5 font-extrabold text-tt-cream">Add a photo of your pet</p>
        <p className="mt-0.5 font-sans text-p6 font-semibold text-tt-muted">Face to the camera, good light.</p>
      </div>
      <ModalButton variant="secondary" size="sm" icon="image" onClick={() => inputRef.current?.click()}>
        Upload photo
      </ModalButton>
      <p className="font-sans text-p6 font-semibold text-tt-muted">or drag and drop it here</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload a photo of your pet"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export const ImmortalizePetFlow = ({
  onPurchaseComplete,
}: {
  onPurchaseComplete?: () => void;
}) => {
  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const [selectedStyle, setSelectedStyle] = useState(PortraitStyle.HIGHNESS);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(
    null
  );
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null
  );
  const [generatedImageId, setGeneratedImageId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessage, setGenerationMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [isPurchaseCompleted, setIsPurchaseCompleted] = useState(false);
  const isMockGenerating = isGenerating || isRegenerating;

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
    };
  }, [uploadedPreviewUrl]);

  const canGenerate = useMemo(
    () => !!uploadedFile && !isGenerating && !isRegenerating,
    [uploadedFile, isGenerating, isRegenerating]
  );

  const getProgressMessage = (percentage: number): string => {
    if (percentage < 10) return "Identifying pet traits...";
    if (percentage < 20) return "Analyzing royal features...";
    if (percentage < 30) return "Selecting perfect style...";
    if (percentage < 40) return "Sketching majestic portrait...";
    if (percentage < 50) return "Painting prestigious artwork...";
    if (percentage < 60) return "Adding regal details...";
    if (percentage < 70) return "Enhancing fur details...";
    if (percentage < 80) return "Perfecting the masterpiece...";
    if (percentage < 90) return "Applying final touches...";
    if (percentage < 95) return "Polishing to perfection...";
    return "Almost ready...";
  };

  useEffect(() => {
    if (!isMockGenerating) {
      setGenerationProgress(0);
      setGenerationMessage("");
      return;
    }

    const startTime = Date.now();
    const duration = 60000;
    let animationFrame = 0;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 99);
      setGenerationProgress(progress);
      setGenerationMessage(getProgressMessage(progress));

      if (isMockGenerating && progress < 99) {
        animationFrame = requestAnimationFrame(updateProgress);
      }
    };

    animationFrame = requestAnimationFrame(updateProgress);
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isMockGenerating]);

  useEffect(() => {
    if (paymentMethod !== "stripe" || !generatedImageId) {
      return;
    }

    trackEvent("begin_checkout", {
      event_id: generatedImageId,
      item_id: "digital",
      item_name: "digital",
      value: DIGITAL_PORTRAIT_PRICE,
      currency: "USD",
    });
  }, [paymentMethod, generatedImageId]);

  const handleImageUpload = (file: File) => {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    setUploadedFile(file);
    setUploadedPreviewUrl(URL.createObjectURL(file));
    setGeneratedImageUrl(null);
    setGeneratedImageId(null);
    setIsPurchaseCompleted(false);
    setGenerationProgress(0);
    setGenerationMessage("");
  };

  const resetFlow = () => {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    setUploadedFile(null);
    setUploadedPreviewUrl(null);
    setGeneratedImageUrl(null);
    setGeneratedImageId(null);
    setIsPurchaseCompleted(false);
    setGenerationProgress(0);
    setGenerationMessage("");
  };

  const generatePortrait = async () => {
    if (!uploadedFile) {
      showToast({ message: "Upload a pet photo first.", isError: true });
      return;
    }

    setIsGenerating(true);
    try {
      const image = await IMAGE_API.generatePortrait(uploadedFile, {
        name: profile?.name || "My Pet",
        style: selectedStyle,
      });
      const portraitUrl = image?.aiUrl || image?.url;
      if (!image?._id || !portraitUrl) {
        throw new Error("Portrait generation failed");
      }

      setGenerationProgress(100);
      setGenerationMessage("Complete!");
      await new Promise((resolve) => setTimeout(resolve, 500));
      setGeneratedImageId(image._id);
      setGeneratedImageUrl(portraitUrl);
      setIsPurchaseCompleted(false);
      trackEvent("add_to_cart", {
        event_id: image._id,
        item_name: "digital",
        item_category: "portrait",
        item_id: "digital",
        value: DIGITAL_PORTRAIT_PRICE,
        currency: "USD",
        quantity: 1,
      });
      showToast({
        message: "Portrait is ready. Complete checkout to immortalize it.",
      });
    } catch (error) {
      console.error("generate portrait error:", error);
      showToast({
        message: "Could not generate portrait. Try a clearer image.",
        isError: true,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const regeneratePortrait = async () => {
    if (!generatedImageId) {
      return;
    }

    setIsRegenerating(true);
    try {
      const image = await IMAGE_API.regeneratePortrait(
        generatedImageId,
        selectedStyle
      );
      const portraitUrl = image?.aiUrl || image?.url;
      if (!portraitUrl) {
        throw new Error("Portrait regeneration failed");
      }
      setGenerationProgress(100);
      setGenerationMessage("Complete!");
      await new Promise((resolve) => setTimeout(resolve, 500));
      setGeneratedImageUrl(portraitUrl);
      showToast({ message: "Variant generated. Pick the one you like best." });
    } catch (error) {
      console.error("regenerate portrait error:", error);
      showToast({
        message:
          error instanceof SignInRequiredError
            ? error.message
            : "Could not regenerate portrait right now.",
        isError: true,
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleStripeSuccess = (response: IMessage) => {
    if (!response?.success) {
      showToast({
        message: response?.message || "Card payment could not be confirmed.",
        isError: true,
      });
      return;
    }

    setIsPurchaseCompleted(true);
    setProfileUpdate({
      portraitPurchases: (profile?.portraitPurchases || 0) + 1,
      monthPortraitPurchases: (profile?.monthPortraitPurchases || 0) + 1,
    });
    showToast({
      message:
        response?.message || "Purchase confirmed. Your pet is now in-game.",
      symbol: "tails",
    });
    onPurchaseComplete?.();
  };

  const handleCryptoSuccess = (response: IMessage) => {
    setIsPurchaseCompleted(true);
    setProfileUpdate({
      portraitPurchases: (profile?.portraitPurchases || 0) + 1,
      monthPortraitPurchases: (profile?.monthPortraitPurchases || 0) + 1,
    });
    showToast({
      message:
        response?.message || "Purchase confirmed. Your pet is now in-game.",
      symbol: "tails",
    });
    onPurchaseComplete?.();
  };

  const busyLabel = isGenerating ? "GENERATING..." : isRegenerating ? "REGENERATING..." : null;
  return (
    <div className="flex w-full flex-col gap-3" data-testid="pet-art-flow">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 font-sans text-p6 font-semibold leading-snug text-tt-cream md:text-p5">
          Upload a photo of your pet and we turn it into a pixel portrait and a collectible card.
        </p>
        {!isApp && (
          // A plain fact, not a pill: it is not something to tap.
          <span className="inline-flex shrink-0 items-center gap-1.5 font-sans text-p6 font-bold text-tt-gold-400 md:text-p5">
            <PixelIcon name="shopping-bag" size={14} />
            Full portrait: ${DIGITAL_PORTRAIT_PRICE}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr] short:gap-3">
        <ModalSection title="1. Your photo" icon="image" helper="One clear, well-lit photo works best.">
          <div className="flex min-h-[44px] items-center justify-between gap-2 bg-tt-night-950/45 pl-3 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500)/0.6)]">
            <span className="font-sans text-p5 font-bold text-tt-cream">
              <span className="text-tt-muted">Style:</span> {STYLE_LABELS[selectedStyle]}
            </span>
            <ProgressStylePickerModal selectedStyle={selectedStyle} onStyleChange={setSelectedStyle} />
          </div>
          <PetPhotoZone
            onImageUpload={handleImageUpload}
            uploadedImage={uploadedPreviewUrl}
            onClear={resetFlow}
          />
          <ActionRow inline>
            <ModalButton
              variant="primary"
              icon="sparkles"
              busy={isMockGenerating}
              disabled={!canGenerate}
              onClick={generatedImageId && generatedImageUrl ? regeneratePortrait : generatePortrait}
            >
              {busyLabel ?? (generatedImageId ? "REGENERATE" : "GENERATE PORTRAIT")}
            </ModalButton>
            {!uploadedFile && !isMockGenerating && (
              <p className="basis-full font-sans text-p6 font-semibold text-tt-muted md:text-p5" data-testid="generate-hint">
                Upload a photo first.
              </p>
            )}
            {(generatedImageId || generatedImageUrl || uploadedPreviewUrl) && (
              <ModalButton variant="ghost" icon="reload" onClick={resetFlow}>
                RESET
              </ModalButton>
            )}
          </ActionRow>
        </ModalSection>

        <ModalSection
          title={generatedImageUrl ? "2. Your portrait" : "How it works"}
          icon={generatedImageUrl ? "star" : "info-box"}
          tone={generatedImageUrl ? "highlight" : "default"}
        >
          {isMockGenerating ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-4 text-center" role="status">
              <PixelIcon name="loader" size={32} className="text-tt-gold-400 motion-safe:animate-spin" />
              <div>
                <p className="font-primary text-p4 uppercase tracking-wide text-tt-cream">
                  {isRegenerating ? "Refining your portrait" : "Creating your portrait"}
                </p>
                <p className="mt-1 font-sans text-p6 font-semibold text-tt-muted md:text-p5">
                  {generationMessage || "Preparing the canvas..."}
                </p>
              </div>
              <div className="w-full max-w-sm">
                <ProgressBar value={generationProgress} max={100} label="Portrait progress" />
                <p className="mt-1 font-sans text-p6 font-bold text-tt-cream">{Math.round(generationProgress)}%</p>
              </div>
            </div>
          ) : generatedImageUrl ? (
            <>
              <div
                className="relative select-none overflow-hidden [box-shadow:0_0_0_2px_rgb(var(--tt-gold-500)/0.6)]"
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              >
                <img
                  src={generatedImageUrl}
                  alt="Generated pet portrait"
                  className="pointer-events-none aspect-[3/4] w-full object-cover"
                  draggable={false}
                />
                {!isPurchaseCompleted && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-[-50%] select-none"
                      style={{
                        backgroundImage: "url(/portrait/watermark-logo.webp)",
                        backgroundSize: "18%",
                        backgroundRepeat: "space",
                        backgroundPosition: "center",
                        opacity: 0.1,
                        transform: "rotate(-25deg)",
                      }}
                    />
                    <StatusPill tone="neutral" className="pointer-events-none absolute left-3 top-3 z-20 bg-tt-night-950/80">
                      Free preview
                    </StatusPill>
                  </>
                )}
              </div>
              <p className="font-sans text-p6 font-semibold text-tt-muted md:text-p5">
                Includes the full-size digital portrait and your pet as a cat you can play.
              </p>

              {isApp ? (
                <AppCheckoutNotice />
              ) : (
                <>
                  <div className="flex gap-2" role="group" aria-label="Payment method">
                    <ModalButton
                      size="sm"
                      variant={paymentMethod === "stripe" ? "primary" : "secondary"}
                      aria-pressed={paymentMethod === "stripe"}
                      onClick={() => setPaymentMethod("stripe")}
                    >
                      CARD
                    </ModalButton>
                    <ModalButton
                      size="sm"
                      variant={paymentMethod === "crypto" ? "primary" : "secondary"}
                      aria-pressed={paymentMethod === "crypto"}
                      onClick={() => setPaymentMethod("crypto")}
                    >
                      WEB3
                    </ModalButton>
                  </div>

                  {paymentMethod === "stripe" ? (
                    <StripePayment
                      price={DIGITAL_PORTRAIT_PRICE}
                      id={generatedImageId || ""}
                      imageId={generatedImageId || ""}
                      entityType={EntityType.IMAGE}
                      productType="digital"
                      onSuccess={handleStripeSuccess}
                    />
                  ) : (
                    <Web3Providers>
                      <div className="flex flex-col items-center gap-2">
                        <Web3Transfer
                          price={DIGITAL_PORTRAIT_PRICE}
                          entityType={EntityType.IMAGE}
                          id={generatedImageId || undefined}
                          user={profile?._id}
                          text="IMMORTALIZE WITH CRYPTO"
                          loadingText="FINALIZING..."
                          onSuccess={handleCryptoSuccess}
                        />
                      </div>
                    </Web3Providers>
                  )}
                </>
              )}

              {isPurchaseCompleted && (
                <p
                  role="status"
                  className="flex items-center gap-2 bg-tt-mint/10 px-3 py-2 font-sans text-p5 font-bold text-tt-mint [box-shadow:inset_0_0_0_2px_rgb(var(--tt-mint)/0.45)]"
                >
                  <PixelIcon name="check" size={16} /> Purchase confirmed. Your pet is now in your collection.
                </p>
              )}
            </>
          ) : (
            <>
              <ol className="flex flex-col gap-2">
                {PET_ART_FLOW_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex items-start gap-3 bg-tt-night-950/45 p-3 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500)/0.6)]"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center bg-tt-gold-400 font-primary text-p4 text-tt-gold-ink"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-primary text-p4 uppercase leading-none tracking-wide text-tt-cream">
                        <PixelIcon name={step.icon} size={16} className="text-tt-gold-400" />
                        {step.title}
                        <span className="font-sans text-p6 font-bold normal-case tracking-normal text-tt-muted">{step.eta}</span>
                      </p>
                      <p className="mt-1 font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-3">
                <img
                  src={cdnFile("tail/cat-celebrate.webp")}
                  className="h-12 w-12 shrink-0 object-contain"
                  alt=""
                  aria-hidden="true"
                />
                <p className="font-sans text-p6 font-semibold leading-snug text-tt-cream md:text-p5">
                  Every portrait joins your collection and your pet joins the game.
                </p>
              </div>
            </>
          )}
        </ModalSection>
      </div>
    </div>
  );
};
