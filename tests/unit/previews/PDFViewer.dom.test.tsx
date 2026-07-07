/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import PDFViewer from '@/renderer/pages/conversation/Preview/components/viewers/PDFViewer';

const platformState = {
  isElectron: false,
};

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readFileBuffer: { invoke: vi.fn() },
    },
    shell: {
      openFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platformState.isElectron,
}));

vi.mock('@/renderer/components/media/WebviewHost', () => ({
  __esModule: true,
  default: ({ url }: { url: string }) => <div data-testid='webview-host' data-url={url} />,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewToolbarExtrasContext', () => ({
  usePreviewToolbarExtras: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick, title }: { children?: React.ReactNode; onClick?: () => void; title?: string }) => (
    <button type='button' onClick={onClick} title={title}>
      {children}
    </button>
  ),
  Message: {
    useMessage: () => [{ error: vi.fn(), success: vi.fn() }, null],
  },
}));

describe('PDFViewer', () => {
  beforeEach(() => {
    platformState.isElectron = false;
    vi.mocked(ipcBridge.fs.readFileBuffer.invoke).mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:pdf-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('renders PDF through iframe in WebUI mode without webview', async () => {
    vi.mocked(ipcBridge.fs.readFileBuffer.invoke).mockResolvedValue('JVBERi0xLjQ=');

    const { container } = render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(screen.getByTitle('preview.pdf.title')).toHaveAttribute('src', 'blob:pdf-preview');
    });
    expect(ipcBridge.fs.readFileBuffer.invoke).toHaveBeenCalledWith({
      path: '/workspace/report.pdf',
      workspace: '/workspace',
    });
    expect(container.querySelector('webview')).toBeNull();
    expect(screen.queryByTestId('webview-host')).not.toBeInTheDocument();
  });

  it('keeps Electron desktop rendering on WebviewHost', async () => {
    platformState.isElectron = true;

    render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(screen.getByTestId('webview-host')).toHaveAttribute('data-url', 'file:///workspace/report.pdf');
    });
    expect(ipcBridge.fs.readFileBuffer.invoke).not.toHaveBeenCalled();
  });
});
