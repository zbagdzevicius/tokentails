import clsx from "clsx";
import { HUD_BUTTON_CLASSES } from "./AudioControls";
import { AudioIcon } from "./icons";

/** The lobby HUD's 44 px Settings button (gear). */
export const SettingsButton = ({ onClick, className }: { onClick: () => void; className?: string }) => (
  <button
    type="button"
    aria-label="Settings"
    aria-haspopup="dialog"
    title="Settings"
    data-testid="settings-button"
    onClick={onClick}
    className={clsx(HUD_BUTTON_CLASSES, className)}
  >
    <AudioIcon name="gear" />
  </button>
);
