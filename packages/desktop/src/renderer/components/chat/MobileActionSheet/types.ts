/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';

export interface MobileActionSheetOption {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  active?: boolean;
  /** Prevents selecting an option that is already persisted in an add-only list. */
  disabled?: boolean;
}

export interface MobileActionSheetSubMenu {
  title: ReactNode;
  options: MobileActionSheetOption[];
  onSelect: (key: string) => void;
  emptyText?: ReactNode;
  /** Show a pinned client-side search field above the option list. */
  searchable?: boolean;
  searchPlaceholder?: string;
  searchTestId?: string;
  /** When false, options behave as plain action rows (no radio). Default: true. */
  selectable?: boolean;
  /**
   * When true, options are multi-select checkboxes (driven by `option.active`).
   * Tapping toggles a selection via `onSelect` but keeps the submenu open so the
   * user can toggle several in a row (used for Skills / MCP on the home page).
   */
  multiSelect?: boolean;
}

export interface MobileActionSheetEntry {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  /** Right-side hint, e.g. current model label */
  meta?: ReactNode;
  /** Visual style — `muted` reduces icon emphasis (use for actions, not stateful selectors) */
  variant?: 'primary' | 'muted';
  /** Optional divider above this entry */
  dividerBefore?: boolean;
  /** If provided, tapping opens a submenu */
  submenu?: MobileActionSheetSubMenu;
  /** If provided, tapping triggers this action and closes the sheet */
  onClick?: () => void;
  disabled?: boolean;
}

export interface MobileActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  entries: MobileActionSheetEntry[];
}
