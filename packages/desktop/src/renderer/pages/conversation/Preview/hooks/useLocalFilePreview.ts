/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { localFileRef } from '@/common/types/chatFile';
import type { LocalFileLinkReference } from '@/renderer/components/Markdown/markdownUtils';
import { getCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
import { getContentTypeByExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { isDirectoryMetadata } from '@/renderer/utils/file/fileMetadata';
import { resolvePreviewPayload, upgradeFileRef } from '@/renderer/utils/file/previewPayload';
import { dispatchWorkspaceRevealFileEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { useCallback } from 'react';

const getFileNameFromPath = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
};

const getPreviewLanguage = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
};

const hasFileExtension = (filePath: string): boolean => {
  const fileName = getFileNameFromPath(filePath.replace(/[\\/]+$/, ''));
  return /\.[^./\\]+$/.test(fileName);
};

const getMarkdownFallbackPath = (filePath: string): string | null => {
  if (!filePath || /[\\/]$/.test(filePath) || hasFileExtension(filePath)) return null;
  return `${filePath}.md`;
};

type UseLocalFilePreviewOptions = {
  replace?: boolean;
};

export const useLocalFilePreview = (workspace?: string, options?: UseLocalFilePreviewOptions) => {
  const { openPreview } = usePreviewContext();
  const replacePreviewTab = options?.replace ?? true;

  return useCallback(
    async (filePath: string, reference?: LocalFileLinkReference) => {
      const targetRevealKey =
        reference?.line == null ? undefined : `${filePath}:${reference.line}:${reference.column ?? ''}:${Date.now()}`;
      let previewFilePath = filePath;
      let fileRef = localFileRef(previewFilePath);

      try {
        let metadata;
        try {
          metadata = await ipcBridge.fs.getContentMetadata.invoke({ file: fileRef });
        } catch {
          const fallbackPath = getMarkdownFallbackPath(previewFilePath);
          if (fallbackPath) {
            const fallbackRef = localFileRef(fallbackPath);
            try {
              metadata = await ipcBridge.fs.getContentMetadata.invoke({ file: fallbackRef });
              previewFilePath = fallbackPath;
              fileRef = fallbackRef;
            } catch {
              // Preserve the original missing-file path below.
            }
          }
        }

        if (metadata == null) throw new Error('File metadata unavailable');
        if (isDirectoryMetadata(metadata)) {
          dispatchWorkspaceRevealFileEvent({ workspace, filePath: previewFilePath });
          return;
        }

        fileRef = await upgradeFileRef(fileRef, getCurrentProject());
        const fileName = getFileNameFromPath(previewFilePath);
        const contentType = getContentTypeByExtension(fileName);
        const payload = await resolvePreviewPayload(fileRef, contentType);

        openPreview(
          payload.content,
          contentType,
          {
            title: fileName,
            file_name: fileName,
            fileRef,
            file_path: previewFilePath,
            workspace,
            language: getPreviewLanguage(fileName),
            targetLine: reference?.line,
            targetColumn: reference?.column,
            targetRevealKey,
            editable: contentType === 'markdown' || contentType === 'image' || payload.oversized ? false : undefined,
            oversized: payload.oversized,
            sizeBytes: payload.sizeBytes,
            thresholdBytes: payload.thresholdBytes,
            lastModified: payload.lastModified,
          },
          { replace: replacePreviewTab }
        );
      } catch {
        const fileName = getFileNameFromPath(previewFilePath);
        const contentType = getContentTypeByExtension(fileName);
        openPreview(
          '',
          contentType,
          {
            title: fileName,
            file_name: fileName,
            fileRef,
            file_path: previewFilePath,
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
