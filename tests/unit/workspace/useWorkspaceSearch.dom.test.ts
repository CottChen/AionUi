/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceSearch } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceSearch';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';

const searchResult: IDirOrFile[] = [
  {
    name: 'workspace',
    fullPath: '/workspace',
    relativePath: '',
    isDir: true,
    isFile: false,
    children: [
      {
        name: 'match.md',
        fullPath: '/workspace/src/match.md',
        relativePath: 'src/match.md',
        isDir: false,
        isFile: true,
        searchMatchKind: 'content',
        searchContentMatchCount: 2,
      },
    ],
  },
];

describe('useWorkspaceSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the selected search mode to workspace loading', async () => {
    const loadWorkspace = vi.fn().mockResolvedValue(searchResult);
    const { result } = renderHook(() => useWorkspaceSearch({ workspace: '/workspace', loadWorkspace }));

    act(() => {
      result.current.setSearchMode('content');
    });

    await act(async () => {
      result.current.onSearch('needle');
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(loadWorkspace).toHaveBeenCalledWith('/workspace', 'needle', 'content');
    expect(result.current.searchStats).toEqual({ fileCount: 1, contentBlockCount: 2 });
  });

  it('searches inside the selected folder when using folder scope', async () => {
    const loadWorkspace = vi.fn().mockResolvedValue(searchResult);
    const { result } = renderHook(() => useWorkspaceSearch({ workspace: '/workspace', loadWorkspace }));

    act(() => {
      result.current.setSearchText('needle');
    });

    await act(async () => {
      result.current.selectSearchFolder('/workspace/src', 'src');
      await Promise.resolve();
    });

    expect(loadWorkspace).toHaveBeenCalledWith('/workspace/src', 'needle', 'all');
    expect(result.current.searchScope).toBe('currentFolder');
    expect(result.current.searchFolderLabel).toBe('src');
  });
});
