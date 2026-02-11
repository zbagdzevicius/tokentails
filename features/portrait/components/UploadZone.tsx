import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cat, PawPrint, X, Sparkles } from "lucide-react";
import { StylePickerDrawer, PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";

interface UploadZoneProps {
  onImageUpload: (file: File) => void;
  uploadedImage: string | null;
  onClear: () => void;
  selectedStyle: PortraitStyle;
  onStyleChange: (style: PortraitStyle) => void;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}

export const UploadZone = ({ onImageUpload, uploadedImage, onClear, selectedStyle, onStyleChange, drawerOpen, onDrawerOpenChange }: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      onImageUpload(file);
    }
  }, [onImageUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  }, [onImageUpload]);

  return (
    <div className="w-full max-w-md mx-auto relative">
      {/* Style Picker - absolute top right with padding */}
      <div className="absolute top-4 right-4 z-10">
        <StylePickerDrawer
          selectedStyle={selectedStyle}
          onStyleChange={onStyleChange}
          open={drawerOpen}
          onOpenChange={onDrawerOpenChange}
        />
      </div>
      <AnimatePresence mode="wait">
        {uploadedImage ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="relative rounded-sm overflow-hidden card-baroque"
          >
            <img
              src={uploadedImage}
              alt="Uploaded cat"
              className="w-full aspect-[3/4] object-cover"
            />
            <button
              onClick={onClear}
              className="absolute top-3 right-3 p-2 rounded-sm bg-background/90 backdrop-blur-sm hover:bg-background transition-colors border border-border"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background via-background/80 to-transparent">
              <p className="text-xs text-muted-foreground flex items-center gap-2 tracking-wider uppercase">
                <Sparkles className="w-3 h-3 text-primary" />
                Ready for transformation
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`upload-zone rounded-sm p-6 cursor-pointer transition-all duration-400 ${
              isDragging ? "dragging" : ""
            }`}
          >
            <label className="cursor-pointer flex flex-col items-center gap-3">
              <motion.div
                animate={{ y: isDragging ? -3 : 0 }}
                className="w-12 h-12 rounded-sm bg-secondary/50 border border-border flex items-center justify-center"
              >
                {isDragging ? (
                  <Cat className="w-5 h-5 text-primary" />
                ) : (
                  <PawPrint className="w-5 h-5 text-muted-foreground" />
                )}
              </motion.div>
              <div className="text-center">
                <p className="text-foreground text-sm tracking-wide">
                  Upload your pet photo
                </p>
                <p className="text-xs text-muted-foreground mt-1 tracking-wide">
                  Use a well-lit photo
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
