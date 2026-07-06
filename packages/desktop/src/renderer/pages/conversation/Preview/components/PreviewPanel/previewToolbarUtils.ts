/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decide whether to show the download button in the preview toolbar.
 *
 * Text/code/markdown files may be previewed from a workspace path, but WebUI
 * users still need an explicit way to save a local copy.
 *
 * @param contentType - The preview tab content type
 * @param hasFilePath - Whether the tab is backed by a file on disk
 */
export const shouldShowDownload = (_contentType: string, _hasFilePath: boolean): boolean => {
  return true;
};
