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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const PDF_BLOB_TYPE = 'application/pdf';

const isReadyToRenderPdfSource = (source: string): boolean =>
  source.startsWith('blob:') ||
  source.startsWith('data:') ||
  source.startsWith('http://') ||
  source.startsWith('https://');

const createPdfBlobUrlFromBase64 = (base64: string): string => {
  const binary = atob(base64);
  const chunkSize = 8192;
  const chunks: ArrayBuffer[] = [];
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const buffer = new ArrayBuffer(slice.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index);
    }
    chunks.push(buffer);
  }
  return URL.createObjectURL(new Blob(chunks, { type: PDF_BLOB_TYPE }));
};

const PDFPreview: React.FC<PDFPreviewProps> = ({ file_path, content, hideToolbar = false, workspace }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [browserPdfSrc, setBrowserPdfSrc] = useState<string>('');
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;
  const isElectron = useMemo(() => isElectronDesktop(), []);

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
    let revokedUrl: string | null = null;
    let cancelled = false;

    const loadPdfSource = async () => {
      setLoading(true);
      setError(null);
      setBrowserPdfSrc('');

      if (!file_path && !content) {
        setError(t('preview.pdf.pathMissing'));
        setLoading(false);
        return;
      }

      if (content) {
        const nextSrc = isReadyToRenderPdfSource(content) ? content : createPdfBlobUrlFromBase64(content);
        const shouldRevoke = !isReadyToRenderPdfSource(content);
        if (cancelled) {
          if (shouldRevoke) URL.revokeObjectURL(nextSrc);
          return;
        }
        if (shouldRevoke) revokedUrl = nextSrc;
        if (!cancelled) {
          setBrowserPdfSrc(nextSrc);
          setLoading(false);
        }
        return;
      }

      if (isElectron) {
        setBrowserPdfSrc(buildPdfSrc(file_path, content));
        setLoading(false);
        return;
      }

      try {
        const base64 = await ipcBridge.fs.readFileBuffer.invoke({ path: file_path!, workspace });
        if (!base64) {
          throw new Error(t('preview.pdf.pathMissing'));
        }

        const blobUrl = createPdfBlobUrlFromBase64(base64);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        revokedUrl = blobUrl;
        setBrowserPdfSrc(blobUrl);
        setLoading(false);
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
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [content, file_path, isElectron, t, workspace]);

  const handleBrowserPdfLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleBrowserPdfError = useCallback(() => {
    setError(t('preview.pdf.loadFailed'));
    setLoading(false);
  }, [t]);

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
    if (isElectron && browserPdfSrc) {
      setLoading(false);
    }
  }, [browserPdfSrc, isElectron]);

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
          {file_path && (
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
            key={browserPdfSrc}
            url={browserPdfSrc}
            className='bg-bg-1'
            onDidFinishLoad={handleElectronPdfLoad}
            onDidFailLoad={handleElectronPdfError}
          />
        ) : (
          <iframe
            key={browserPdfSrc}
            src={browserPdfSrc}
            className='w-full h-full border-0 bg-bg-1'
            title={t('preview.pdf.title')}
            onLoad={handleBrowserPdfLoad}
            onError={handleBrowserPdfError}
          />
        )}
      </div>
    </div>
  );
};

export default PDFPreview;
