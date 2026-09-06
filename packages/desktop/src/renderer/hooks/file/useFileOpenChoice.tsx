/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LocalFileLinkReference } from '@/renderer/components/Markdown/markdownUtils';
import { Message, Modal } from '@arco-design/web-react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { isTextFile } from '@/renderer/pages/conversation/Preview/fileUtils';
import { downloadFileFromPath } from '@/renderer/utils/file/download';

const getFileName = (filePath: string): string => filePath.replace(/\\/g, '/').split('/').pop() || filePath;

/**
 * Open a file from a conversation. Text files go directly to the preview;
 * binary files let the user choose preview or download.
 */
export const useFileOpenChoice = (workspace?: string) => {
  const { t } = useTranslation();
  const openPreview = useLocalFilePreview(workspace);

  const download = useCallback(
    async (filePath: string) => {
      try {
        await downloadFileFromPath(filePath, getFileName(filePath), workspace);
      } catch {
        Message.error(t('conversation.workspace.contextMenu.downloadFailed', { defaultValue: 'Download failed' }));
      }
    },
    [t, workspace]
  );

  return useCallback(
    (filePath: string, reference?: LocalFileLinkReference) => {
      if (isTextFile(filePath)) {
        return openPreview(filePath, reference);
      }

      const fileName = getFileName(filePath);
      const handlePreview = () => {
        void openPreview(filePath, reference);
      };
      const handleDownload = () => {
        void download(filePath);
      };

      Modal.confirm({
        title: t('conversation.workspace.contextMenu.open', { defaultValue: 'Open file' }),
        content: fileName,
        okText: t('preview.preview', { defaultValue: 'Preview' }),
        cancelText: t('common.download', { defaultValue: 'Download' }),
        onOk: handlePreview,
        onCancel: handleDownload,
        closable: false,
        maskClosable: false,
        // Arco renders cancel before ok by default; keep preview first as requested.
        footer: (cancelButtonNode, okButtonNode) => (
          <>
            {okButtonNode}
            {cancelButtonNode}
          </>
        ),
      });
      return undefined;
    },
    [download, openPreview, t]
  );
};
