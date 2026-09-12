/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message, Spin } from '@arco-design/web-react';
import { IconFile, IconFolder, IconPlus, IconUp } from '@arco-design/web-react/icon';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { getBaseUrl } from '@/common/adapter/httpBridge';
import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';
import AionModal from '@/renderer/components/base/AionModal';

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
}

interface DirectoryData {
  items: DirectoryItem[];
  canGoUp: boolean;
  parentPath?: string;
  currentPath?: string;
}

interface DirectorySelectionModalProps {
  visible: boolean;
  isFileMode?: boolean;
  onConfirm: (paths: string[] | undefined) => void;
  onCancel: () => void;
}

const DirectorySelectionModal: React.FC<DirectorySelectionModalProps> = ({
  visible,
  isFileMode = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [directoryData, setDirectoryData] = useState<DirectoryData>({ items: [], canGoUp: false });
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const loadDirectory = useCallback(
    async (dirPath = '') => {
      setLoading(true);
      setError(null);
      try {
        const showFiles = isFileMode ? 'true' : 'false';
        const response = await fetch(
          `${getBaseUrl()}/api/fs/browse?path=${encodeURIComponent(dirPath)}&showFiles=${showFiles}`,
          {
            method: 'GET',
            credentials: 'include',
          }
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `HTTP ${response.status}`);
          return;
        }
        const envelope = await response.json();
        // Backend wraps the payload in { success, data, ... }.
        const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
        if (!data || !Array.isArray(data.items)) {
          setError('Invalid response from server');
          return;
        }
        // Older backends return Windows verbatim paths (`\\?\C:\DEV`), which
        // break agent spawning when stored as a workspace (issue #3191).
        // 旧版后端会返回 `\\?\` 前缀的 Windows 路径，存为工作区后会导致 agent 启动失败。
        const normalized: DirectoryData = {
          items: (data.items as Array<DirectoryItem & { is_directory?: boolean; is_file?: boolean }>).map((item) => ({
            name: item.name,
            path: stripWindowsVerbatimPrefix(item.path),
            isDirectory: item.isDirectory ?? item.is_directory === true,
            isFile: item.isFile ?? item.is_file === true,
          })),
          canGoUp: data.canGoUp ?? data.can_go_up === true,
          parentPath:
            typeof (data.parentPath ?? data.parent_path) === 'string'
              ? stripWindowsVerbatimPrefix(data.parentPath ?? data.parent_path)
              : undefined,
          currentPath:
            typeof (data.currentPath ?? data.current_path) === 'string'
              ? stripWindowsVerbatimPrefix(data.currentPath ?? data.current_path)
              : undefined,
        };
        setDirectoryData(normalized);
        setCurrentPath(normalized.currentPath || dirPath);
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [isFileMode]
  );

  useEffect(() => {
    if (visible) {
      setSelectedPath('');
      setCreateVisible(false);
      setCreateName('');
      loadDirectory('').catch((error) => console.error('Failed to load initial directory:', error));
    }
  }, [visible, loadDirectory]);

  const handleCreateDirectory = async () => {
    const name = createName.trim();
    if (!name || !currentPath || createLoading) return;
    setCreateLoading(true);
    try {
      const result = await ipcBridge.fs.createDirectory.invoke({ parent_path: currentPath, name });
      setCreateVisible(false);
      setCreateName('');
      setSelectedPath(result.path);
      await loadDirectory(currentPath);
      Message.success(t('fileSelection.createDirectorySuccess'));
    } catch (createError) {
      console.error('Failed to create directory:', createError);
      Message.error(t('fileSelection.createDirectoryFailed'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleItemClick = (item: DirectoryItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path).catch((error) => console.error('Failed to load directory:', error));
    }
  };

  // Double-click behavior removed - single click now handles directory navigation
  // 移除双击行为 - 单击现在处理目录导航
  const handleItemDoubleClick = (_item: DirectoryItem) => {
    // No-op: single click already handles navigation
  };

  const handleSelect = (path: string) => {
    setSelectedPath(path);
  };

  const handleGoUp = () => {
    if (directoryData.parentPath !== undefined) {
      // Handle '__ROOT__' as empty path to show drive list on Windows
      // 处理 '__ROOT__' 为空路径，在 Windows 上显示驱动器列表
      const targetPath = directoryData.parentPath === '__ROOT__' ? '' : directoryData.parentPath;
      loadDirectory(targetPath).catch((error) => console.error('Failed to load parent directory:', error));
    }
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onConfirm([selectedPath]);
    }
  };

  const canSelect = (item: DirectoryItem) => {
    return isFileMode ? item.isFile : item.isDirectory;
  };

  return (
    // This picker is opened *from* other modals (team/cron create dialogs sit at
    // zIndex 10000, the cron workspace menu at 10020), so it must float above all
    // of them — it's the topmost layer while choosing a folder.
    <AionModal
      variant='standard'
      visible={visible}
      header={{
        title: isFileMode ? '📄 ' + t('fileSelection.selectFile') : '📁 ' + t('fileSelection.selectDirectory'),
        showClose: true,
      }}
      onCancel={onCancel}
      onOk={handleConfirm}
      okButtonProps={{ disabled: !selectedPath }}
      className='w-[90vw] md:w-[600px]'
      style={{ width: 'min(600px, 90vw)' }}
      wrapStyle={{ zIndex: 10050 }}
      maskStyle={{ zIndex: 10040 }}
      footer={{
        render: () => (
          <div className='w-full flex justify-between items-center'>
            <div
              className='text-t-secondary text-14px overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]'
              title={selectedPath || currentPath}
            >
              {selectedPath ||
                currentPath ||
                (isFileMode ? t('fileSelection.pleaseSelectFile') : t('fileSelection.pleaseSelectDirectory'))}
            </div>
            <div className='flex gap-10px'>
              <Button onClick={onCancel} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
                {t('common.cancel')}
              </Button>
              <Button
                type='primary'
                onClick={handleConfirm}
                disabled={!selectedPath}
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        ),
      }}
    >
      <Spin loading={loading} className='w-full'>
        <div className='w-full border border-b-base rd-4px overflow-hidden' style={{ height: 'min(400px, 60vh)' }}>
          {!isFileMode && (
            <div className='flex items-center gap-8px border-b border-b-light p-8px'>
              <Button
                size='small'
                icon={<IconPlus />}
                disabled={!currentPath || loading || createLoading}
                onClick={() => setCreateVisible((visible) => !visible)}
              >
                {t('fileSelection.createDirectory')}
              </Button>
              {createVisible && (
                <div className='flex min-w-0 flex-1 items-center gap-6px'>
                  <Input
                    size='small'
                    autoFocus
                    value={createName}
                    placeholder={t('fileSelection.createDirectoryName')}
                    onChange={setCreateName}
                    onPressEnter={() => void handleCreateDirectory()}
                  />
                  <Button
                    size='small'
                    type='primary'
                    disabled={!createName.trim()}
                    loading={createLoading}
                    onClick={() => void handleCreateDirectory()}
                  >
                    {t('common.confirm')}
                  </Button>
                  <Button size='small' disabled={createLoading} onClick={() => setCreateVisible(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className='h-full overflow-y-auto'>
            {directoryData.canGoUp && (
              <div
                className='flex items-center p-10px border-b border-b-light cursor-pointer hover:bg-hover transition'
                onClick={handleGoUp}
              >
                <IconUp className='mr-10px text-t-secondary' />
                <span>..</span>
              </div>
            )}
            {error && (
              <div className='p-16px text-center text-danger text-13px'>
                <div>{error}</div>
                <Button size='mini' className='mt-8px' onClick={() => loadDirectory(currentPath).catch(() => {})}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </div>
            )}
            {directoryData.items.map((item, index) => (
              <div
                key={index}
                className='flex items-center justify-between p-10px border-b border-b-light cursor-pointer hover:bg-hover transition'
                style={selectedPath === item.path ? { background: 'var(--brand-light)' } : {}}
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemDoubleClick(item)}
              >
                <div className='flex items-center flex-1 min-w-0'>
                  {item.isDirectory ? (
                    <IconFolder className='mr-10px text-warning shrink-0' />
                  ) : (
                    <IconFile className='mr-10px text-primary shrink-0' />
                  )}
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{item.name}</span>
                </div>
                {canSelect(item) && (
                  <Button
                    type='primary'
                    size='mini'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(item.path);
                    }}
                  >
                    {t('common.select')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Spin>
    </AionModal>
  );
};

export default DirectorySelectionModal;
