/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type ScopedAgentModeSelectionParams = {
  previousMode: string;
  previousSelectionScope: string | null;
  selectionScope: string;
  availableModes: string[];
  fallbackMode: string;
};

export function resolveScopedAgentModeSelection({
  previousMode,
  previousSelectionScope,
  selectionScope,
  availableModes,
  fallbackMode,
}: ScopedAgentModeSelectionParams): string {
  const scopeChanged = previousSelectionScope !== selectionScope;
  const hasAvailableModes = availableModes.length > 0;

  if (!scopeChanged && previousMode && (!hasAvailableModes || availableModes.includes(previousMode))) {
    return previousMode;
  }

  return fallbackMode;
}
