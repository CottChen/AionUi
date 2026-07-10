/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { buildPdfSrc } from '../../previewUrls';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PDFPreviewProps {
  /**
   * PDF file path (absolute path on disk)
   * PDF 文件路径（磁盘上的绝对路径）
   */
  file_path?: string;
  /**
   * PDF content as base64 or blob URL
   * PDF 内容（base64 或 blob URL）
   */
  content?: string;
  hideToolbar?: boolean;
  workspace?: string;
}

type BrowserPdfSource = { kind: 'url'; url: string } | { kind: 'data'; data: Uint8Array };

type PdfViewport = {
  width: number;
  height: number;
};

type PdfRenderTask = {
  promise: Promise<void>;
  cancel?: () => void;
};

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void> | void;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocumentProxy>;
  destroy?: () => Promise<void> | void;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc?: string };
  getDocument: (source: { url: string } | { data: Uint8Array }) => PdfLoadingTask;
};

const isUrlPdfSource = (source: string): boolean =>
  source.startsWith('blob:') || source.startsWith('http://') || source.startsWith('https://');

const normalizeBase64PdfContent = (content: string): string => {
  const commaIndex = content.indexOf(',');
  if (content.startsWith('data:') && commaIndex >= 0) {
    return content.slice(commaIndex + 1);
  }
  return content;
};

const createPdfBytesFromBase64 = (base64: string): Uint8Array => {
  const binary = atob(normalizeBase64PdfContent(base64));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const getPdfErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const PdfCanvasPage: React.FC<{
  pdfDocument: PdfDocumentProxy;
  pageNumber: number;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  onError: (message: string) => void;
}> = ({ pdfDocument, pageNumber, scrollRootRef, title, onError }) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [shouldRender, setShouldRender] = useState(false);
  const [canvasSize, setCanvasSize] = useState<PdfViewport | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextShouldRender = entry?.isIntersecting ?? false;
        setShouldRender((currentShouldRender) =>
          currentShouldRender === nextShouldRender ? currentShouldRender : nextShouldRender
        );
      },
      {
        root: scrollRootRef.current,
        rootMargin: '900px 0px',
      }
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [scrollRootRef]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const updateWidth = () => setContainerWidth(wrapper.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldRender || !containerWidth) return;

    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;

    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, containerWidth - 24);
        const cssScale = Math.min(2, Math.max(0.2, availableWidth / baseViewport.width));
        const viewport = page.getViewport({ scale: cssScale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Canvas context unavailable');
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const nextCanvasSize = { width: Math.floor(viewport.width), height: Math.floor(viewport.height) };
        setCanvasSize((currentCanvasSize) =>
          currentCanvasSize?.width === nextCanvasSize.width && currentCanvasSize.height === nextCanvasSize.height
            ? currentCanvasSize
            : nextCanvasSize
        );
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) {
          onError(getPdfErrorMessage(error));
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [containerWidth, onError, pageNumber, pdfDocument, shouldRender]);

  const placeholderHeight = canvasSize ? `${canvasSize.height}px` : '320px';
  const placeholderWidth = canvasSize ? `${canvasSize.width}px` : '100%';

  return (
    <div ref={wrapperRef} className='w-full flex justify-center py-8px'>
      {shouldRender ? (
        <canvas
          ref={canvasRef}
          className='max-w-full bg-bg-1 shadow-sm border border-border-1'
          data-testid='pdf-page-canvas'
          aria-label={`${title} ${pageNumber}`}
        />
      ) : (
        <div
          className='max-w-full bg-bg-1 border border-border-1'
          style={{ width: placeholderWidth, height: placeholderHeight }}
          aria-hidden='true'
        />
      )}
    </div>
  );
};

const PdfCanvasDocument: React.FC<{
  source: BrowserPdfSource;
  title: string;
  loadingLabel: string;
  onError: (message: string) => void;
}> = ({ source, title, loadingLabel, onError }) => {
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocumentProxy | null = null;
    let loadingTask: PdfLoadingTask | null = null;

    const loadDocument = async () => {
      try {
        const [pdfjsLib, pdfjsWorker] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJsModule>,
          import('pdfjs-dist/legacy/build/pdf.worker.mjs?url') as Promise<{ default: string }>,
        ]);
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument(source.kind === 'url' ? { url: source.url } : { data: source.data.slice() });
        const nextDocument = await loadingTask.promise;
        loadedDocument = nextDocument;
        if (cancelled) {
          void nextDocument.destroy?.();
          return;
        }
        setPdfDocument(nextDocument);
        setLoading(false);
      } catch (error) {
        if (!cancelled) {
          onError(getPdfErrorMessage(error));
          setLoading(false);
        }
      }
    };

    setLoading(true);
    setPdfDocument(null);
    void loadDocument();

    return () => {
      cancelled = true;
      void loadingTask?.destroy?.();
      void loadedDocument?.destroy?.();
    };
  }, [onError, source]);

  if (loading || !pdfDocument) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>{loadingLabel}</div>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className='h-full w-full overflow-auto bg-bg-2 px-12px py-8px'>
      {Array.from({ length: pdfDocument.numPages }, (_, pageIndex) => (
        <PdfCanvasPage
          key={pageIndex + 1}
          pdfDocument={pdfDocument}
          pageNumber={pageIndex + 1}
          scrollRootRef={scrollContainerRef}
          title={title}
          onError={onError}
        />
      ))}
    </div>
  );
};

const PDFPreview: React.FC<PDFPreviewProps> = ({ file_path, content, hideToolbar = false, workspace }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [electronPdfSrc, setElectronPdfSrc] = useState<string>('');
  const [browserPdfSource, setBrowserPdfSource] = useState<BrowserPdfSource | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;
  const isElectron = useMemo(() => isElectronDesktop(), []);
  const showOpenInSystemButton = isElectron && Boolean(file_path);

  const handleOpenInSystem = useCallback(async () => {
    if (!file_path) {
      messageApi.error(t('preview.errors.openWithoutPath'));
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(file_path);
      messageApi.success(t('preview.openInSystemSuccess'));
    } catch {
      messageApi.error(t('preview.openInSystemFailed'));
    }
  }, [file_path, messageApi, t]);

  useEffect(() => {
    let cancelled = false;

    const loadPdfSource = async () => {
      setLoading(true);
      setError(null);
      setElectronPdfSrc('');
      setBrowserPdfSource(null);

      if (!file_path && !content) {
        setError(t('preview.pdf.pathMissing'));
        setLoading(false);
        return;
      }

      if (content) {
        if (!cancelled) {
          setBrowserPdfSource(
            isUrlPdfSource(content)
              ? { kind: 'url', url: content }
              : {
                  kind: 'data',
                  data: createPdfBytesFromBase64(content),
                }
          );
          setLoading(false);
        }
        return;
      }

      if (isElectron) {
        setElectronPdfSrc(buildPdfSrc(file_path, content));
        setLoading(false);
        return;
      }

      try {
        const base64 = await ipcBridge.fs.readFileBuffer.invoke({ path: file_path!, workspace });
        if (!base64) {
          throw new Error(t('preview.pdf.pathMissing'));
        }

        if (!cancelled) {
          setBrowserPdfSource({ kind: 'data', data: createPdfBytesFromBase64(base64) });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`${t('preview.pdf.loadFailed')}: ${err instanceof Error ? err.message : String(err)}`);
          setLoading(false);
        }
      }
    };

    void loadPdfSource();

    return () => {
      cancelled = true;
    };
  }, [content, file_path, isElectron, t, workspace]);

  const handleElectronPdfError = useCallback(
    (_errorCode: number, errorDescription: string) => {
      setError(`${t('preview.pdf.loadFailed')}: ${errorDescription}`);
      setLoading(false);
    },
    [t]
  );

  const handleElectronPdfLoad = useCallback(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isElectron && electronPdfSrc) {
      setLoading(false);
    }
  }, [electronPdfSrc, isElectron]);

  const handleBrowserPdfError = useCallback(
    (message: string) => {
      setError(`${t('preview.pdf.loadFailed')}: ${message}`);
      setLoading(false);
    },
    [t]
  );

  // 设置工具栏扩展（必须在所有条件返回之前调用）
  // Set toolbar extras (must be called before any conditional returns)
  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext || loading || error) return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📄 {t('preview.pdf.title')}</span>
          <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, t, loading, error]);

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        {messageContextHolder}
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>{t('preview.pdf.unableDisplay')}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        {messageContextHolder}
        <div className='text-14px text-t-secondary'>{t('preview.loading')}</div>
      </div>
    );
  }

  return (
    <div className='h-full w-full bg-bg-1 flex flex-col'>
      {messageContextHolder}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📄 {t('preview.pdf.title')}</span>
            <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
          </div>
          {showOpenInSystemButton && (
            <Button size='mini' type='text' onClick={handleOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openInSystemApp')}</span>
            </Button>
          )}
        </div>
      )}
      {/* PDF 内容区域 / PDF content area */}
      <div className='flex-1 overflow-hidden bg-bg-1'>
        {isElectron && file_path ? (
          <WebviewHost
            key={electronPdfSrc}
            url={electronPdfSrc}
            className='bg-bg-1'
            onDidFinishLoad={handleElectronPdfLoad}
            onDidFailLoad={handleElectronPdfError}
          />
        ) : browserPdfSource ? (
          <PdfCanvasDocument
            source={browserPdfSource}
            title={t('preview.pdf.title')}
            loadingLabel={t('preview.loading')}
            onError={handleBrowserPdfError}
          />
        ) : (
          <div className='flex items-center justify-center h-full'>
            <div className='text-14px text-t-secondary'>{t('preview.loading')}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreview;
