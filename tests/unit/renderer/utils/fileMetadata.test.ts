/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isDirectoryMetadata } from '@/renderer/utils/file/fileMetadata';

describe('isDirectoryMetadata', () => {
  it('recognizes directory metadata from backend and renderer field variants', () => {
    expect(isDirectoryMetadata({ type: 'application/octet-stream', isDirectory: true })).toBe(true);
    expect(isDirectoryMetadata({ type: 'application/octet-stream', is_directory: true })).toBe(true);
    expect(isDirectoryMetadata({ type: 'inode/directory' })).toBe(true);
  });

  it('does not treat ordinary file metadata as directories', () => {
    expect(isDirectoryMetadata({ type: 'text/markdown' })).toBe(false);
    expect(isDirectoryMetadata({ type: 'application/octet-stream', isDirectory: false, is_directory: false })).toBe(
      false
    );
  });
});
