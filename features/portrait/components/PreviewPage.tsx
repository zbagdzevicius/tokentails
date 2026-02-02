import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Download, PawPrint, Cat, Clock, Truck, RefreshCw, Sparkles, Timer } from "lucide-react";
import { Button } from "@/features/portrait/ui/button";
import { TrustpilotReviews } from "@/features/portrait/components/TrustpilotReviews";
import { Testimonials } from "@/features/portrait/components/Testimonials";
import { useCountdown } from "@/features/portrait/hooks/useCountdown";
import { trackFacebookEvent } from "@/components/FacebookPixel";

interface PurchaseOption {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  badge?: string;
  description: string;
  features: string[];
  icon: typeof Download;
  ctaText: string;
  size?: string;
  delivery?: string;
  includesDigital?: boolean;
}

const purchaseOptions: PurchaseOption[] = [
  {
    id: "digital",
    title: "Instant Masterpiece",
    price: 19,
    originalPrice: 29,
    badge: "Most Popular",
    description: "Instant high-resolution download — perfect for sharing or saving.",
    features: ["No Watermark", "Instant Download", "High-Resolution Portrait"],
    icon: Download,
    ctaText: "Download Now",
  },
  {
    id: "print",
    title: "Fine Art Print",
    price: 69,
    badge: "Recommended",
    description: "Printed on museum-quality archival paper with fade-resistant inks.",
    features: ["Museum-quality archival paper", "Fade-resistant inks", "Made to last decades"],
    icon: PawPrint,
    ctaText: "Order Print",
    size: '12" x 16"',
    delivery: "5-14 days",
    includesDigital: true,
  },
  {
    id: "canvas",
    title: "Large Canvas",
    price: 199,
    badge: "The Perfect Gift 🐱",
    description: "Gallery-quality canvas on wood — arrives ready to hang.",
    features: ["Ready to hang", 'Cotton-blend canvas, 1.25" thick', "Mounting included"],
    icon: Cat,
    ctaText: "Order Canvas",
    size: '18" x 24"',
    delivery: "5-14 days",
    includesDigital: true,
  },
];

interface PreviewPageProps {
  generatedImages: string[];
  onRetry: () => void;
  onBack: () => void;
}

export const PreviewPage = ({ generatedImages, onRetry, onBack }: PreviewPageProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { formattedTime, isExpired } = useCountdown(15);

  // Track InitiateCheckout event when preview page loads
  useEffect(() => {
    trackFacebookEvent("InitiateCheckout", {
      content_name: "Royal Feline Portrait",
      content_category: "Portrait Service",
      content_ids: ["portrait"],
      num_items: 1,
    });
  }, []);

  const handlePurchase = (optionId: string, price: number) => {
    // Track Purchase event
    trackFacebookEvent("Purchase", {
      content_name: "Royal Feline Portrait",
      content_category: "Portrait Service",
      content_ids: [optionId],
      value: price,
      currency: "USD",
    });
    
    // This would integrate with Stripe
    console.log("Purchase:", optionId, price);
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto px-4">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-8">
          <span className="text-primary">Upload</span>
          <span className="w-8 h-px bg-primary" />
          <span className="text-primary">Preview</span>
          <span className="w-8 h-px bg-border" />
          <span>Download or Order</span>
        </div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-display text-4xl md:text-5xl text-center mb-8"
        >
          Your Masterpiece is Ready!
        </motion.h1>

        {/* Generated Images */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-4xl mx-auto mb-12"
        >
          {/* Main Image */}
          <div className="relative mb-4">
            <div 
              className="portrait-frame rounded-lg overflow-hidden max-w-lg mx-auto select-none"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            >
              <img
                src={generatedImages[selectedImageIndex]}
                alt="Generated royal portrait"
                className="w-full aspect-square object-cover pointer-events-none"
                draggable={false}
              />
              {/* Repeating logo watermark overlay */}
              <div 
                className="absolute inset-[-50%] pointer-events-none select-none"
                style={{
                  backgroundImage: `url(/portrait/watermark-logo.webp)`,
                  backgroundSize: '18%',
                  backgroundRepeat: 'space',
                  backgroundPosition: 'center',
                  opacity: 0.07,
                  transform: 'rotate(-25deg)',
                }}
              />
            </div>
            <button
              onClick={onRetry}
              className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm text-sm hover:bg-background transition-colors border border-border"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>

        </motion.div>

        {/* Purchase Options */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-display text-2xl text-center mb-8">Choose Your Format</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {purchaseOptions.map((option, index) => {
              const Icon = option.icon;
              return (
                <motion.div
                  key={option.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className={`relative card-baroque rounded-xl p-6 flex flex-col ${
                    option.badge === "Most Popular" ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {option.badge && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium ${
                      option.badge === "Most Popular" || option.badge === "Recommended"
                        ? "bg-primary text-primary-foreground" 
                        : "bg-gold text-background"
                    }`}>
                      {option.badge}
                    </div>
                  )}

                  <div className="text-center mb-4">
                    <h3 className="font-display text-xl mb-2">{option.title}</h3>
                    <div className="flex items-center justify-center gap-2">
                      {option.originalPrice && !isExpired && (
                        <span className="text-muted-foreground line-through text-lg">
                          ${option.originalPrice}
                        </span>
                      )}
                      <span className="text-3xl font-bold">
                        ${option.id === "digital" && isExpired ? option.originalPrice : option.price}
                      </span>
                    </div>
                    {/* Countdown Timer for Digital Option */}
                    {option.id === "digital" && !isExpired && (
                      <div className="flex items-center justify-center gap-1.5 mt-2 text-sm text-primary">
                        <Timer className="w-4 h-4" />
                        <span>Expires in</span>
                        <span className="font-mono font-semibold">{formattedTime}</span>
                      </div>
                    )}
                    {option.id === "digital" && isExpired && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Discount expired
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground text-center mb-4">
                    {option.description}
                  </p>

                  {/* Size Display */}
                  {option.size && (
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground">
                        Size: <span className="text-foreground font-medium">{option.size}</span>
                      </p>
                    </div>
                  )}

                  {/* Features */}
                  <ul className="space-y-2 mb-4 flex-1">
                    {option.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Delivery & Extras */}
                  {option.delivery && (
                    <div className="mb-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gold">
                        <Truck className="w-4 h-4" />
                        <span>Free Shipping ($20 value)</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>Delivery: {option.delivery}</span>
                      </div>
                      {option.includesDigital && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Sparkles className="w-4 h-4" />
                          <span>+ Includes digital download</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CTA */}
                  <Button
                    variant={option.id === "digital" ? "hero" : "baroque"}
                    size="lg"
                    className="w-full"
                    onClick={() => handlePurchase(option.id, option.id === "digital" && isExpired ? (option.originalPrice || option.price) : option.price)}
                  >
                    <Icon className="w-4 h-4" />
                    {option.ctaText}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Trustpilot Reviews */}
        <TrustpilotReviews />

        {/* Testimonials */}
        <Testimonials />

        {/* Back Button */}
        <div className="mt-12 text-center">
          <Button variant="ghost" onClick={onBack}>
            ← Create another portrait
          </Button>
        </div>
      </div>
    </div>
  );
};
