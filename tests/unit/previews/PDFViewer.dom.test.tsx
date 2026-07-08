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

const pdfMocks = vi.hoisted(() => ({
  destroyDocument: vi.fn(),
  destroyTask: vi.fn(),
  getDocument: vi.fn(),
  getPage: vi.fn(),
  render: vi.fn(),
}));

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

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfMocks.getDocument,
}));

vi.mock('pdfjs-dist/legacy/build/pdf.worker.mjs?url', () => ({
  default: 'pdf.worker.js',
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
    pdfMocks.destroyDocument.mockReset();
    pdfMocks.destroyTask.mockReset();
    pdfMocks.getDocument.mockReset();
    pdfMocks.getPage.mockReset();
    pdfMocks.render.mockReset();
    pdfMocks.getPage.mockImplementation(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale }),
      render: pdfMocks.render,
    }));
    pdfMocks.render.mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: pdfMocks.getPage,
        destroy: pdfMocks.destroyDocument,
      }),
      destroy: pdfMocks.destroyTask,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({
        setTransform: vi.fn(),
      })),
    });
  });

  it('renders PDF through PDF.js canvases in WebUI mode without webview', async () => {
    vi.mocked(ipcBridge.fs.readFileBuffer.invoke).mockResolvedValue('JVBERi0xLjQ=');

    const { container } = render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(pdfMocks.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('pdf-page-canvas')).toHaveLength(2);
    });
    expect(ipcBridge.fs.readFileBuffer.invoke).toHaveBeenCalledWith({
      path: '/workspace/report.pdf',
      workspace: '/workspace',
    });
    expect(container.querySelector('webview')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByTestId('webview-host')).not.toBeInTheDocument();
  });

  it('keeps Electron desktop rendering on WebviewHost', async () => {
    platformState.isElectron = true;

    render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(screen.getByTestId('webview-host')).toHaveAttribute('data-url', 'file:///workspace/report.pdf');
    });
    expect(ipcBridge.fs.readFileBuffer.invoke).not.toHaveBeenCalled();
    expect(pdfMocks.getDocument).not.toHaveBeenCalled();
  });
});
