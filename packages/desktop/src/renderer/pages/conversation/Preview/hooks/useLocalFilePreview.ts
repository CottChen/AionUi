/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { localFileRef } from '@/common/types/chatFile';
import type { PreviewContentType } from '@/common/types/office/preview';
import type { LocalFileLinkReference } from '@/renderer/components/Markdown/markdownUtils';
import {
  LARGE_TEXT_PREVIEW_MAX_LENGTH,
  LARGE_TEXT_PREVIEW_THRESHOLD,
} from '@/renderer/pages/conversation/Preview/constants';
import { getContentTypeByExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { dispatchWorkspaceRevealFileEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { isDirectoryMetadata } from '@/renderer/utils/file/fileMetadata';
import { useCallback } from 'react';

const getFileNameFromPath = (file_path: string): string => {
  const normalized = file_path.replace(/\\/g, '/');
  return normalized.split('/').pop() || file_path;
};

const getPreviewLanguage = (file_name: string): string => {
  const dotIndex = file_name.lastIndexOf('.');
  return dotIndex >= 0 ? file_name.slice(dotIndex + 1).toLowerCase() : '';
};

const shouldReadPreviewContent = (contentType: PreviewContentType): boolean =>
  !['pdf', 'word', 'excel', 'ppt'].includes(contentType);

const hasFileExtension = (file_path: string): boolean => {
  const fileName = getFileNameFromPath(file_path.replace(/[\\/]+$/, ''));
  return /\.[^./\\]+$/.test(fileName);
};

const getMarkdownFallbackPath = (file_path: string): string | null => {
  if (!file_path || /[\\/]$/.test(file_path) || hasFileExtension(file_path)) return null;
  return `${file_path}.md`;
};

type UseLocalFilePreviewOptions = {
  replace?: boolean;
};

export const useLocalFilePreview = (workspace?: string, options?: UseLocalFilePreviewOptions) => {
  const { openPreview } = usePreviewContext();
  const replacePreviewTab = options?.replace ?? true;

  return useCallback(
    async (file_path: string, reference?: LocalFileLinkReference) => {
      const targetRevealKey =
        reference?.line == null ? undefined : `${file_path}:${reference.line}:${reference.column ?? ''}:${Date.now()}`;
      let previewFilePath = file_path;
      let fileRef = localFileRef(previewFilePath);
      let content = '';
      let isLargeTextTruncated = false;

      try {
        let metadata;
        try {
          metadata = await ipcBridge.fs.getContentMetadata.invoke({ file: fileRef });
        } catch {
          const fallbackPath = getMarkdownFallbackPath(previewFilePath);
          if (fallbackPath) {
            const fallbackRef = localFileRef(fallbackPath);
            try {
              const fallbackMetadata = await ipcBridge.fs.getContentMetadata.invoke({ file: fallbackRef });
              previewFilePath = fallbackPath;
              fileRef = fallbackRef;
              metadata = fallbackMetadata;
            } catch {
              // Preserve the original missing-file error path below.
            }
          }
        }
        if (metadata == null) throw null;

        if (isDirectoryMetadata(metadata)) {
          dispatchWorkspaceRevealFileEvent({ workspace, filePath: previewFilePath });
          return;
        }

        const fileName = getFileNameFromPath(previewFilePath);
        const contentType = getContentTypeByExtension(fileName);
        if (contentType === 'image') {
          content = await ipcBridge.fs.readContent.invoke({ file: fileRef, encoding: 'dataurl' });
        } else if (shouldReadPreviewContent(contentType)) {
          content = await ipcBridge.fs.readContent.invoke({ file: fileRef, encoding: 'utf8' });

          if (contentType === 'code' && content.length > LARGE_TEXT_PREVIEW_THRESHOLD) {
            content = content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH);
            isLargeTextTruncated = true;
          }
        }

        openPreview(
          content,
          contentType,
          {
            title: fileName,
            file_name: fileName,
            fileRef,
            file_path: previewFilePath,
            workspace,
            language: getPreviewLanguage(fileName),
            truncated: isLargeTextTruncated,
            targetLine: reference?.line,
            targetColumn: reference?.column,
            targetRevealKey,
            editable: contentType === 'markdown' || contentType === 'image' || isLargeTextTruncated ? false : undefined,
          },
          { replace: replacePreviewTab }
        );
      } catch {
        const fileName = getFileNameFromPath(file_path);
        const contentType = getContentTypeByExtension(fileName);
        openPreview(
          '',
          contentType,
          {
            title: fileName,
            file_name: fileName,
            fileRef,
            file_path,
            workspace,
            language: getPreviewLanguage(fileName),
            targetLine: reference?.line,
            targetColumn: reference?.column,
            targetRevealKey,
            editable: false,
            missingFile: true,
          },
          { replace: replacePreviewTab }
        );
      }
    },
    [openPreview, replacePreviewTab, workspace]
  );
};
