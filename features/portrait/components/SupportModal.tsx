import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/features/portrait/ui/drawer";
import { Mail, MessageCircle, ExternalLink } from "lucide-react";
import { Button } from "@/features/portrait/ui/button";

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SupportModal = ({ open, onOpenChange }: SupportModalProps) => {
  const handleDiscordClick = () => {
    window.open(
      "https://discord.com/channels/1225030025435156540/1242380944787116052",
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleEmailClick = () => {
    window.location.href = "mailto:info@tokentails.com";
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="text-center pb-4 flex-shrink-0">
          <DrawerTitle className="text-2xl font-bold tracking-wide">
            Support & Contact
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground mt-2">
            We're here to help
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Email Support */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Email Support
                </h3>
                <p className="text-sm text-muted-foreground">
                  Get in touch via email for general inquiries
                </p>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Email Address
                </p>
                <a
                  href="mailto:info@tokentails.com"
                  className="text-primary hover:underline font-medium"
                >
                  info@tokentails.com
                </a>
              </div>
              <Button
                onClick={handleEmailClick}
                variant="hero"
                className="w-full"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </Button>
            </div>
          </div>

          {/* Discord Support */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Discord Support
                </h3>
                <p className="text-sm text-muted-foreground">
                  Create a support ticket on our Discord server
                </p>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Join our Discord community and create a support ticket for
                faster assistance with technical issues, account problems, or
                general questions.
              </p>
              <Button
                onClick={handleDiscordClick}
                variant="hero"
                className="w-full"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Open Discord Support
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Common Questions */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Common Questions
            </h3>
            <div className="space-y-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="font-medium text-foreground mb-1">
                  How long does portrait generation take?
                </p>
                <p className="text-muted-foreground">
                  Digital portraits are typically generated in 60 seconds.
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="font-medium text-foreground mb-1">
                  Can I get a refund for card packs?
                </p>
                <p className="text-muted-foreground">
                  Unopened packs may be eligible for refund within 7 days.
                  Opened packs are non-refundable.
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="font-medium text-foreground mb-1">
                  How do I track my order?
                </p>
                <p className="text-muted-foreground">
                  You'll receive a tracking number via email once your physical
                  product ships.
                </p>
              </div>
            </div>
          </div>

          {/* Response Time */}
          <div className="bg-primary/10 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Response Time:</strong> We
              typically respond to emails within 24-48 hours. Discord support
              tickets are usually answered faster.
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
