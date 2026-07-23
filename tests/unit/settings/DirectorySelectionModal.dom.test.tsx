/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigProvider } from '@arco-design/web-react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

describe('DirectorySelectionModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.__backendPort = 3210;
  });

  it('opens at the default path and confirms the current directory in directory mode', async () => {
    const onConfirm = vi.fn();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          currentPath: '/projects/demo',
          parentPath: '/projects',
          canGoUp: true,
          items: [],
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ConfigProvider>
        <DirectorySelectionModal visible defaultPath='/projects/demo' onConfirm={onConfirm} onCancel={vi.fn()} />
      </ConfigProvider>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3210/api/fs/browse?path=%2Fprojects%2Fdemo&showFiles=false',
        expect.objectContaining({ credentials: 'include', method: 'GET' })
      );
    });

    fireEvent.click(screen.getByText('common.confirm'));

    expect(onConfirm).toHaveBeenCalledWith(['/projects/demo']);
  });
});
