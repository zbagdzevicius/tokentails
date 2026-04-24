import { IMAGE_API } from "@/api/image-api";
import { trackEvent } from "@/components/GoogleTagManager";
import { PixelButton } from "@/components/shared/PixelButton";
import { ProgressStylePickerModal } from "@/components/codex/ProgressStylePickerModal";
import { Tag } from "@/components/shared/Tag";
import { StripePayment } from "@/components/web3/StripePayment";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { Web3Transfer } from "@/components/web3/transfer/Web3Transfer";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { UploadZone } from "@/features/portrait/components/UploadZone";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import { IMessage } from "@/models/cats";
import { EntityType } from "@/models/save";
import { useEffect, useMemo, useState } from "react";

const DIGITAL_PORTRAIT_PRICE = 6;

const STYLE_LABELS: Record<PortraitStyle, string> = {
  [PortraitStyle.HIGHNESS]: "Highness",
  [PortraitStyle.MONARCH]: "Monarch",
  [PortraitStyle.ARISTOCRAT]: "Aristocrat",
  [PortraitStyle.COMMANDER]: "Commander",
};

const PET_ART_FLOW_STEPS = [
  {
    title: "Upload Pet Photo",
    detail:
      "Use one clear, well-lit photo so traits can be detected precisely.",
    icon: "icons/check.webp",
    eta: "10s",
    reward: "Profile-ready trait match",
  },
  {
    title: "Generate Variants",
    detail:
      "Create and refine styles until the portrait matches your pet perfectly.",
    icon: "icons/rocket.png",
    eta: "45s",
    reward: "Premium collectible preview",
  },
  {
    title: "Complete Purchase",
    detail:
      "Pay with card or web3 to mint the portrait and unlock in-game perks.",
    icon: "icons/gift.png",
    eta: "5s",
    reward: "Permanent in-game unlock",
  },
];

type PaymentMethod = "stripe" | "crypto";

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
    null,
  );
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null,
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
    [uploadedFile, isGenerating, isRegenerating],
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
        selectedStyle,
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
        message: "Could not regenerate portrait right now.",
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

  return (
    <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
      <img
        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
        alt="immortalize pattern"
      />
      <img
        src={cdnFile("tail/guard.webp")}
        className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-25"
        alt="immortalize mascot"
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900">
            IMMORTALIZE YOUR REAL PET
          </span>
          <Tag isSmall>$6 DIGITAL</Tag>
        </div>
        <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-2 font-primary text-p6 md:text-p5 text-yellow-900">
          Upload a real pet photo, generate a stylized portrait and card of your
          pet, then purchase with card or web3.
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-3">
          <div className="rounded-xl border-2 border-yellow-900 bg-yellow-50/95 p-3">
            <UploadZone
              onImageUpload={handleImageUpload}
              uploadedImage={uploadedPreviewUrl}
              onClear={resetFlow}
              selectedStyle={selectedStyle}
              onStyleChange={setSelectedStyle}
              uploadButtonLabel="Upload photo"
              stylePickerControl={
                <ProgressStylePickerModal
                  selectedStyle={selectedStyle}
                  onStyleChange={setSelectedStyle}
                />
              }
            />
            <div className="mt-2 rounded-lg border border-yellow-900 bg-yellow-100/95 px-2 py-1 font-primary text-p6 md:text-p5 text-yellow-900">
              Active style: {STYLE_LABELS[selectedStyle]}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PixelButton
                text={
                  isGenerating
                    ? "GENERATING..."
                    : isRegenerating
                    ? "REGENERATING..."
                    : generatedImageId
                    ? "REGENERATE"
                    : "GENERATE PORTRAIT"
                }
                isSmall
                isDisabled={!canGenerate}
                onClick={
                  generatedImageId && generatedImageUrl
                    ? regeneratePortrait
                    : generatePortrait
                }
              />
              {(generatedImageId ||
                generatedImageUrl ||
                uploadedPreviewUrl) && (
                <PixelButton isSmall text="RESET" onClick={resetFlow} />
              )}
            </div>
          </div>

          <div className="rounded-xl border-2 border-yellow-900 bg-yellow-50/95 p-3 flex flex-col">
            {isMockGenerating ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-yellow-900 bg-yellow-100/90 p-5 min-h-[420px]">
                <div className="h-10 w-10 rounded-full border-4 border-yellow-900/30 border-t-yellow-900 animate-spin" />
                <div className="w-full text-center">
                  <div className="font-primary text-p5 md:text-p4 font-bold text-yellow-900 uppercase tracking-wide">
                    {isRegenerating ? "Refining Portrait" : "Creating Portrait"}
                  </div>
                  <div className="mt-1 font-primary text-p6 md:text-p5 text-yellow-900">
                    {generationMessage || "Preparing canvas..."}
                  </div>
                </div>
                <div className="w-full">
                  <div className="h-2.5 w-full rounded-full border border-yellow-900 bg-yellow-50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-300 ease-out"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                  <div className="mt-1 text-center font-primary text-p6 md:text-p5 text-yellow-900">
                    {Math.round(generationProgress)}%
                  </div>
                </div>
              </div>
            ) : generatedImageUrl ? (
              <>
                <div
                  className="rounded-xl border-2 border-yellow-900 overflow-hidden bg-black/10 relative select-none"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <img
                    src={generatedImageUrl}
                    alt="Generated pet portrait"
                    className="w-full aspect-[3/4] object-cover pointer-events-none"
                    draggable={false}
                  />
                  {!isPurchaseCompleted && (
                    <>
                      <div
                        className="absolute inset-[-50%] pointer-events-none select-none"
                        style={{
                          backgroundImage: "url(/portrait/watermark-logo.webp)",
                          backgroundSize: "18%",
                          backgroundRepeat: "space",
                          backgroundPosition: "center",
                          opacity: 0.1,
                          transform: "rotate(-25deg)",
                        }}
                      />
                      <div className="absolute top-3 left-3 flex items-center px-2.5 py-1 rounded-full bg-background/80 backdrop-blur-sm border border-border pointer-events-none z-20">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                          FREE PREVIEW
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-2 rounded-lg border border-yellow-900 bg-yellow-100/95 px-2 py-1 font-primary text-p6 md:text-p5 text-yellow-900">
                  Includes high-resolution digital portrait and in-game pet
                  unlock.
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <span className="-ml-2">
                    <PixelButton
                      isSmall
                      className="!m-0"
                      text="CARD"
                      active={paymentMethod === "stripe"}
                      onClick={() => setPaymentMethod("stripe")}
                    />
                  </span>
                  <span className="-ml-2">
                    <PixelButton
                      isSmall
                      className="!m-0"
                      text="WEB3"
                      active={paymentMethod === "crypto"}
                      onClick={() => setPaymentMethod("crypto")}
                    />
                  </span>
                </div>

                {paymentMethod === "stripe" ? (
                  <div className="mt-2">
                    <StripePayment
                      price={DIGITAL_PORTRAIT_PRICE}
                      id={generatedImageId || ""}
                      imageId={generatedImageId || ""}
                      entityType={EntityType.IMAGE}
                      productType="digital"
                      onSuccess={handleStripeSuccess}
                    />
                  </div>
                ) : (
                  <div className="mt-2">
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
                  </div>
                )}

                {isPurchaseCompleted && (
                  <div className="mt-2 rounded-lg border-2 border-green-700 bg-green-100 px-3 py-2 font-primary text-p6 md:text-p5 text-green-900">
                    Purchase confirmed. Your immortalized pet has been added to
                    your account progression.
                  </div>
                )}
              </>
            ) : (
              <div className="h-full min-h-[320px] rounded-xl border-2 border-yellow-900 bg-gradient-to-br from-yellow-100/95 via-orange-100/90 to-yellow-200/90 p-3 relative overflow-hidden">
                <img
                  src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                  className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
                  alt="pet art flow pattern"
                />
                <div className="relative z-10 flex flex-col gap-2">
                  <div className="rounded-xl border-2 border-yellow-900 bg-yellow-50/95 px-2.5 py-2.5">
                    <div className="flex items-start gap-2">
                      <img
                        src={cdnFile("tail/mascot-point-right.webp")}
                        className="h-10 w-10 md:h-12 md:w-12 shrink-0 object-contain"
                        alt="pet art flow mascot"
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900">
                            DIGITAL PORTRAIT FLOW
                          </span>
                          <span className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-2 py-0.5 font-primary text-p6 md:text-p5 text-yellow-900 font-bold">
                            READY IN ~60S
                          </span>
                        </div>
                        <div className="mt-1 font-primary text-p6 md:text-p5 text-yellow-900 leading-tight">
                          Turn your real pet into a premium in-game collectible
                          and unlock extra progression value.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {PET_ART_FLOW_STEPS.map((step, index) => {
                      const isLastStep =
                        index === PET_ART_FLOW_STEPS.length - 1;
                      return (
                        <div
                          key={step.title}
                          className="relative rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-2 py-2"
                        >
                          {!isLastStep && (
                            <div className="absolute left-[18px] top-9 h-[calc(100%-28px)] w-[2px] bg-yellow-900/20" />
                          )}
                          <div className="flex items-start gap-2">
                            <div className="h-7 w-7 shrink-0 rounded-md border-2 border-yellow-900 bg-gradient-to-br from-yellow-300 to-orange-300 text-yellow-900 font-primary text-p6 md:text-p5 font-bold flex items-center justify-center">
                              {index + 1}
                            </div>
                            <div className="h-7 w-7 shrink-0 rounded-md border border-yellow-900 bg-yellow-100 flex items-center justify-center">
                              <img
                                src={cdnFile(step.icon)}
                                className="h-4 w-4 object-contain"
                                alt={`${step.title} icon`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="font-primary text-p6 md:text-p5 font-bold text-yellow-900">
                                  {step.title}
                                </div>
                                <span className="rounded-md border border-yellow-900 bg-yellow-100 px-1.5 py-[1px] font-primary text-p6 md:text-p5 text-yellow-900">
                                  {step.eta}
                                </span>
                              </div>
                              <div className="font-primary text-p6 md:text-p5 text-yellow-900 leading-tight">
                                {step.detail}
                              </div>
                              <div className="mt-1 inline-flex rounded-md border border-yellow-900 bg-white/80 px-1.5 py-[1px] font-primary text-p6 md:text-p5 text-yellow-900">
                                Reward: {step.reward}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border-2 border-yellow-900 bg-gradient-to-r from-yellow-200 to-pink-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={cdnFile("tail/cat-celebrate.webp")}
                        className="h-8 w-8 shrink-0 object-contain"
                        alt="reward mascot"
                      />
                      <div>
                        <div className="font-primary text-p6 md:text-p5 font-bold text-yellow-900">
                          REWARD PATH
                        </div>
                        <div className="font-primary text-p6 md:text-p5 text-yellow-900 leading-tight">
                          Each immortalized portrait strengthens your
                          progression position before airdrop claims.
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      <div className="rounded-md border border-yellow-900 bg-yellow-50/95 px-2 py-1 font-primary text-p6 md:text-p5 text-yellow-900">
                        + Collectible depth
                      </div>
                      <div className="rounded-md border border-yellow-900 bg-yellow-50/95 px-2 py-1 font-primary text-p6 md:text-p5 text-yellow-900">
                        + Tier progression signal
                      </div>
                      <div className="rounded-md border border-yellow-900 bg-yellow-50/95 px-2 py-1 font-primary text-p6 md:text-p5 text-yellow-900">
                        + In-game pet unlock
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
