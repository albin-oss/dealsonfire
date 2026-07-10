/**
 * DOF Design System — the curated public API (DESIGN-SYSTEM-001 §1.2, DS-15).
 * Feature code imports ONLY from here (`@ds`). No wildcard barrels: every export is
 * deliberate, tree-shake-verified, and covered by the quality gates.
 */

// ——— i18n
export { DS_MESSAGES, provideDsMessages, useDsMessages, type DsMessages } from './i18n'

// ——— contracts & tokens
export * from './types'
export { REF_TOKENS, SYS_TOKENS, BRAND_TOKENS, DURATIONS_MS, cssVar } from './tokens/tokens.generated'
export { brandKitStyle, BRAND_VARIABLES, type BrandTheme } from './tokens/brand-kit'
export { ICON_NAMES, type IconName } from './icons/icons.generated'
export { cx, type ClassValue } from './utils/cx'

// ——— theme engine
export { useTheme, useThemeScope, useBrandKit, type ModePreference } from './theme'

// ——— motion
export { TRANSITIONS, type TransitionPreset, useReducedMotion, useTempo } from './motion'

// ——— primitives (L1)
export { default as DofText } from './primitives/dof-text.vue'
export { default as DofIcon } from './primitives/dof-icon.vue'
export { default as DofButton } from './primitives/dof-button.vue'
export { default as DofBadge } from './primitives/dof-badge.vue'
export { default as DofAvatar } from './primitives/dof-avatar.vue'
export { default as DofSkeleton } from './primitives/dof-skeleton.vue'
export { default as DofField } from './primitives/dof-field.vue'
export { default as DofInput } from './primitives/dof-input.vue'
export { default as DofTextarea } from './primitives/dof-textarea.vue'
export { default as DofCheckbox } from './primitives/dof-checkbox.vue'
export { default as DofSwitch } from './primitives/dof-switch.vue'
export { default as DofRadioGroup, type RadioOption } from './primitives/dof-radio-group.vue'
export { default as DofSelect, type SelectItemOption } from './primitives/dof-select.vue'
export { default as DofTooltip } from './primitives/dof-tooltip.vue'
export { default as DofPopover } from './primitives/dof-popover.vue'
export { default as DofCard } from './primitives/dof-card.vue'
export { default as DofDialog } from './primitives/dof-dialog.vue'
export { default as DofSheet } from './primitives/dof-sheet.vue'
export { default as DofMoney } from './primitives/dof-money.vue'
export { default as DofTime } from './primitives/dof-time.vue'
export { default as DofPasswordInput } from './primitives/dof-password-input.vue'
export { default as DofSearchInput } from './primitives/dof-search-input.vue'
export { default as DofNumberInput } from './primitives/dof-number-input.vue'
export { default as DofMoneyInput } from './primitives/dof-money-input.vue'
export { default as DofEmailInput } from './primitives/dof-email-input.vue'
export { default as DofCombobox, type ComboOption } from './primitives/dof-combobox.vue'
export { default as DofMultiSelect, type MultiOption } from './primitives/dof-multi-select.vue'
export { default as DofIconButton } from './primitives/dof-icon-button.vue'
export { default as DofSplitButton } from './primitives/dof-split-button.vue'
export { default as DofChip } from './primitives/dof-chip.vue'
export { default as DofTag } from './primitives/dof-tag.vue'
export { default as DofStatus } from './primitives/dof-status.vue'
export { default as DofProgress } from './primitives/dof-progress.vue'
export { default as DofSpinner } from './primitives/dof-spinner.vue'
export { default as DofDivider } from './primitives/dof-divider.vue'
export { default as DofDropdown, type MenuItem } from './primitives/dof-dropdown.vue'
export { default as DofContextMenu } from './primitives/dof-context-menu.vue'
export { default as DofBreadcrumbs, type Crumb } from './primitives/dof-breadcrumbs.vue'

// ——— patterns (L2): composables
export { useUndoable, DEFAULT_UNDO_WINDOW_MS, type UndoableRun, type UndoEntry, type UseUndoableReturn } from './patterns/composables/use-undoable'
export { useProposal, type ProposalInput, type Confidence, type DeclineReason, type ProposalStatus, type UseProposalReturn } from './patterns/composables/use-proposal'
export { useConfirmation, type ConfirmationInput } from './patterns/composables/use-confirmation'
export { useInlineEdit, type InlineEditOptions } from './patterns/composables/use-inline-edit'
export { useLoadingStage, QUIET_MS, SKELETON_MS, type LoadingStage } from './patterns/composables/use-loading-stage'
export { useJourney, type JourneyStep, type JourneyPersistence } from './patterns/composables/use-journey'
export { useBulkSelection } from './patterns/composables/use-bulk-selection'
export { useSearch } from './patterns/composables/use-search'
export { useQueuedAction, type QueuedAction } from './patterns/composables/use-queued-action'
export { useNotices, notify, dismiss as dismissNotice, type Notice } from './patterns/composables/use-notices'
export { registerCommands, listCommands, useCommands, type Command, type SearchProvider, type SearchResult } from './patterns/composables/commands'

// ——— patterns (L2): blessed compositions
export { default as DofUndoToast } from './patterns/components/dof-undo-toast.vue'
export { default as DofEmptyState } from './patterns/components/dof-empty-state.vue'
export { default as DofProblem } from './patterns/components/dof-problem.vue'
export { default as DofAnnouncer } from './patterns/components/dof-announcer.vue'
export { default as DofToastRegion } from './patterns/components/dof-toast-region.vue'
export { default as DofLoadingState } from './patterns/components/dof-loading-state.vue'
export { default as DofAskBar } from './patterns/components/dof-ask-bar.vue'

// ——— a11y framework
export { useFocusTrap } from './a11y/use-focus-trap'
export { useRovingTabindex } from './a11y/use-roving-tabindex'
export { useShortcuts, listShortcuts, type Shortcut } from './a11y/use-shortcuts'
export { announce, useAnnouncer } from './a11y/announcer'

// ——— surfaces (L3): AI
export { default as DofProposalCard } from './surfaces/ai/dof-proposal-card.vue'
export { default as DofConfidence } from './surfaces/ai/dof-confidence.vue'

// ——— layout shells
export { default as DofFeedLayout } from './layouts/dof-feed-layout.vue'
export { default as DofCatalogLayout } from './layouts/dof-catalog-layout.vue'
export { default as DofObjectLayout } from './layouts/dof-object-layout.vue'
export { default as DofSettingsLayout, type SettingsSection } from './layouts/dof-settings-layout.vue'
export { default as DofRunShell } from './layouts/dof-run-shell.vue'
export { default as DofWorkspaceLayout, type WorkspaceNavItem } from './layouts/dof-workspace-layout.vue'
