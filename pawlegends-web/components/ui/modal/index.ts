/**
 * Modal system primitives (docs/CLIENT.md "Modal system"). Build GameModal bodies from these so
 * every modal shares one depth, rhythm and button hierarchy:
 *
 *   <GameModal title="About me" icon="user" description="Your cat, your stats, your account.">
 *     <ModalStack>
 *       <ModalSection title="Stats" icon="chart" helper="What you have earned so far.">
 *         <StatGrid><StatTile label="Tails" value={120} icon="coins" helper="Rescue points." /></StatGrid>
 *       </ModalSection>
 *       <ActionRow><ModalButton variant="primary">Play</ModalButton><ModalButton variant="ghost">Later</ModalButton></ActionRow>
 *       <DangerZone><ConfirmAction label="Delete account" message="…" confirmLabel="Delete forever" onConfirm={…} /></DangerZone>
 *     </ModalStack>
 *   </GameModal>
 */
export { IconSlot, type ModalIcon } from "./IconSlot";
export {
  ModalButton,
  modalButtonClass,
  type ModalButtonProps,
  type ModalButtonSize,
  type ModalButtonVariant,
} from "./ModalButton";
export { ModalSection, ModalStack, type ModalSectionProps, type ModalSectionTone } from "./ModalSection";
export { StatGrid, StatTile, type StatTileProps, type StatTone } from "./StatTile";
export { ActionRow, type ActionRowProps } from "./ActionRow";
export { ConfirmAction, DangerZone, type ConfirmActionProps, type DangerZoneProps } from "./DangerZone";
export { EmptyState, LoadingState, type EmptyStateProps } from "./EmptyState";
export { KeyValueList, KeyValueRow, type KeyValueRowProps } from "./KeyValueRow";
export {
  ModalTabPanel,
  ModalTabs,
  panelId,
  tabId,
  type ModalTab,
  type ModalTabsProps,
} from "./ModalTabs";
export { StatusPill, type StatusTone } from "./StatusPill";
