/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IFileMetadata } from '@/common/adapter/ipcBridge';

export const isDirectoryMetadata = (
  metadata: Pick<IFileMetadata, 'type' | 'isDirectory' | 'is_directory'>
): boolean => {
  return metadata.isDirectory === true || metadata.is_directory === true || metadata.type === 'inode/directory';
};
