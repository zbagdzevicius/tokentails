import { PIXEL_ICON_NAMES, PixelIcon, type PixelIconName } from "@/components/shared/PixelIcon";
import type { ReactNode } from "react";

/** A PixelIcon name or any node (a sprite, an emoji-free image). */
export type ModalIcon = PixelIconName | ReactNode;

const NAMES = new Set<string>(PIXEL_ICON_NAMES);

/** Renders a ModalIcon: a known PixelIcon name becomes a decorative PixelIcon, anything else as is. */
export const IconSlot = ({
  icon,
  size = 20,
  className,
}: {
  icon: ModalIcon;
  size?: number | string;
  className?: string;
}) => {
  if (icon == null || icon === false) return null;
  if (typeof icon === "string" && NAMES.has(icon)) {
    return <PixelIcon name={icon as PixelIconName} size={size} className={className} />;
  }
  return <>{icon}</>;
};
