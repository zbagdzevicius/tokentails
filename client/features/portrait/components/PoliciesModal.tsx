import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/features/portrait/ui/drawer";

interface PoliciesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PoliciesModal = ({ open, onOpenChange }: PoliciesModalProps) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="text-center pb-4 flex-shrink-0">
          <DrawerTitle className="text-2xl font-bold tracking-wide">
            Privacy Policy & Terms
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground mt-2">
            Last Updated: {new Date().toLocaleDateString()}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Card Packs Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Card Packs Policy
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="leading-relaxed">
                <strong className="text-foreground">Purchase Terms:</strong> All
                card pack purchases are final. Digital trading cards are
                non-refundable once opened. Unopened packs may be eligible for
                refund within 7 days of purchase, subject to our refund policy.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Card Ownership:</strong>{" "}
                Digital cards are stored on our platform and associated with
                your account. You have the right to trade, sell, or transfer
                cards according to our terms of service.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Rarity & Distribution:
                </strong>{" "}
                Card rarities and distributions are determined by our algorithm
                and are subject to change. We do not guarantee specific card
                pulls or rarities.
              </p>
            </div>
          </div>

          {/* Data Collection Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Data Collection & Privacy
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Information We Collect:
                </strong>{" "}
                We collect account information, purchase history, game activity,
                and any information you provide when creating portraits or
                contacting support.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  How We Use Your Data:
                </strong>{" "}
                Your data is used to provide services, process transactions,
                improve our platform, and communicate with you about your
                account and our services.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Data Security:</strong> We
                implement industry-standard security measures to protect your
                information. Payment data is processed through secure
                third-party providers and is not stored on our servers.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Third-Party Services:
                </strong>{" "}
                We may use third-party services for analytics, payment
                processing, and customer support. These services have their own
                privacy policies.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Your Rights:</strong> You
                have the right to access, update, or delete your personal
                information. Contact us at info@tokentails.com to exercise these
                rights.
              </p>
            </div>
          </div>

          {/* Portraits Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Pet Portrait Policy
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="leading-relaxed">
                <strong className="text-foreground">Image Usage:</strong> By
                uploading images for portrait creation, you grant Token Tails
                permission to process and generate portraits. We do not use your
                pet images for any other purpose without your explicit consent.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Portrait Ownership:</strong>{" "}
                Once generated, you own the digital portrait. You may use it for
                personal purposes, including printing and sharing. Commercial
                use may require additional licensing.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Refund Policy:</strong>{" "}
                Digital portrait downloads are non-refundable once generated.
                Physical prints and canvases may be eligible for refund or
                replacement if damaged during shipping, within 30 days of
                delivery.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Processing Time:</strong>{" "}
                Digital portraits are typically generated within 60 seconds.
                Physical products ship within 3-12 business days. Delays may
                occur during high-volume periods.
              </p>
            </div>
          </div>

          {/* General Terms */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              General Terms
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Service Availability:
                </strong>{" "}
                We strive to maintain service availability but do not guarantee
                uninterrupted access. We reserve the right to modify or
                discontinue services with reasonable notice.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Prohibited Activities:
                </strong>{" "}
                Fraudulent transactions, account sharing, or attempts to exploit
                our systems are strictly prohibited and may result in account
                termination.
              </p>
              <p className="leading-relaxed">
                <strong className="text-foreground">Changes to Policy:</strong>{" "}
                We may update this policy periodically. Continued use of our
                services constitutes acceptance of updated terms.
              </p>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Questions about our policies? Contact us at{" "}
              <a
                href="mailto:info@tokentails.com"
                className="text-primary hover:underline"
              >
                info@tokentails.com
              </a>
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
