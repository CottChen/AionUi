/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import PDFViewer from '@/renderer/pages/conversation/Preview/components/viewers/PDFViewer';

const pdfMocks = vi.hoisted(() => ({
  destroyDocument: vi.fn(),
  destroyTask: vi.fn(),
  getDocument: vi.fn(),
  getPage: vi.fn(),
  render: vi.fn(),
}));

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

const platformState = {
  isElectron: false,
};

type MockIntersectionObserver = IntersectionObserver & {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
};

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readContent: { invoke: vi.fn() },
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
  useTranslation: () => ({ t: i18nMock.t }),
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
    vi.mocked(ipcBridge.fs.readContent.invoke).mockReset();
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders PDF through PDF.js canvases in WebUI mode without webview', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('JVBERi0xLjQ=');

    const { container } = render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(pdfMocks.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('pdf-page-canvas')).toHaveLength(2);
    });
    expect(ipcBridge.fs.readContent.invoke).toHaveBeenCalledWith({
      file: { kind: 'local', path: '/workspace/report.pdf' },
      encoding: 'base64',
    });
    expect(container.querySelector('webview')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByTestId('webview-host')).not.toBeInTheDocument();
  });

  it('renders browser PDF pages lazily as they enter the viewport', async () => {
    const observers: MockIntersectionObserver[] = [];
    const MockedIntersectionObserver = vi.fn(function (
      this: MockIntersectionObserver,
      callback: IntersectionObserverCallback
    ) {
      Object.assign(this, {
        callback,
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        takeRecords: vi.fn(() => []),
        root: null,
        rootMargin: '',
        thresholds: [],
      });
      observers.push(this);
    });
    vi.stubGlobal('IntersectionObserver', MockedIntersectionObserver);
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('JVBERi0xLjQ=');

    render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(pdfMocks.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    });
    await waitFor(() => {
      expect(MockedIntersectionObserver).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryAllByTestId('pdf-page-canvas')).toHaveLength(0);
    expect(pdfMocks.getPage).not.toHaveBeenCalled();

    act(() => {
      observers[0].callback(
        [{ isIntersecting: true, target: observers[0].observe.mock.calls[0][0] } as IntersectionObserverEntry],
        observers[0]
      );
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('pdf-page-canvas')).toHaveLength(1);
    });
    expect(pdfMocks.getPage).toHaveBeenCalledTimes(1);
    expect(pdfMocks.getPage).toHaveBeenCalledWith(1);
  });

  it('keeps Electron desktop rendering on WebviewHost', async () => {
    platformState.isElectron = true;

    render(<PDFViewer file_path='/workspace/report.pdf' workspace='/workspace' />);

    await waitFor(() => {
      expect(screen.getByTestId('webview-host')).toHaveAttribute(
        'data-url',
        '/api/fs/stream?kind=local&path=%2Fworkspace%2Freport.pdf'
      );
    });
    expect(ipcBridge.fs.readContent.invoke).not.toHaveBeenCalled();
    expect(pdfMocks.getDocument).not.toHaveBeenCalled();
  });
});
