/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { getLastDirectoryName } from '@/renderer/utils/workspace/workspace';
import { Button, Dropdown, Input, Menu, Popover, Tooltip } from '@arco-design/web-react';
import { Down, Plus, Refresh, Search } from '@icon-park/react';
import React from 'react';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import type { TFunction } from 'i18next';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import type { WorkspaceSearchScope } from '../hooks/useWorkspaceSearch';
import type { WorkspaceSearchMode } from '../hooks/useWorkspaceTree';

type WorkspaceToolbarProps = {
  t: TFunction;
  isWorkspaceCollapsed: boolean;
  setIsWorkspaceCollapsed: (v: boolean) => void;
  isTemporaryWorkspace: boolean;
  workspacePath: string;
  workspaceDisplayName: string;
  // Search
  showSearch: boolean;
  searchText: string;
  setSearchText: (v: string) => void;
  onSearch: (v: string) => void;
  searchInputRef: React.RefObject<RefInputType | null>;
  searchScope: WorkspaceSearchScope;
  setSearchScope: (v: WorkspaceSearchScope) => void;
  searchMode: WorkspaceSearchMode;
  setSearchMode: (v: WorkspaceSearchMode) => void;
  currentFolderLabel: string;
  // Tree state
  loading: boolean;
  refreshWorkspace: () => void;
  // Upload
  handleSelectHostFiles: () => void;
  handleUploadDeviceFiles: () => void;
  setShowHostFileSelector: (v: boolean) => void;
};

/** Toolbar area: workspace name, search toggle, refresh button, upload menu, settings. */
const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  t,
  isWorkspaceCollapsed,
  setIsWorkspaceCollapsed,
  isTemporaryWorkspace,
  workspacePath,
  workspaceDisplayName,
  showSearch,
  searchText,
  setSearchText,
  onSearch,
  searchInputRef,
  searchScope,
  setSearchScope,
  searchMode,
  setSearchMode,
  currentFolderLabel,
  loading,
  refreshWorkspace,
  handleSelectHostFiles,
  handleUploadDeviceFiles,
  setShowHostFileSelector,
}) => {
  const temporaryWorkspaceDetails = isTemporaryWorkspace ? (
    <div className='max-w-360px p-4px text-12px'>
      <div className='mb-10px'>
        <div className='text-t-tertiary mb-3px'>{t('conversation.workspace.temporaryDirectoryName')}</div>
        <div className='font-mono text-t-primary break-all'>{getLastDirectoryName(workspacePath)}</div>
      </div>
      <div>
        <div className='text-t-tertiary mb-3px'>{t('conversation.workspace.temporaryDirectoryPath')}</div>
        <div className='font-mono text-t-primary break-all'>{workspacePath}</div>
      </div>
    </div>
  ) : null;

  const workspaceUploadMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'host') {
          if (isElectronDesktop()) {
            handleSelectHostFiles();
          } else {
            setShowHostFileSelector(true);
          }
        }
        if (key === 'device') {
          handleUploadDeviceFiles();
        }
      }}
    >
      <Menu.Item key='host'>{t('common.fileAttach.addFiles')}</Menu.Item>
      <Menu.Item key='device'>{t('common.fileAttach.myDevice')}</Menu.Item>
    </Menu>
  );

  const scopeLabel =
    searchScope === 'currentFolder'
      ? t('conversation.workspace.searchScope.currentFolder', { folder: currentFolderLabel })
      : t('conversation.workspace.searchScope.workspace');
  const modeLabel = t(`conversation.workspace.searchMode.${searchMode}`);
  const searchScopeMenu = (
    <Menu selectedKeys={[searchScope]} onClickMenuItem={(key) => setSearchScope(key as WorkspaceSearchScope)}>
      <Menu.Item key='workspace'>{t('conversation.workspace.searchScope.workspace')}</Menu.Item>
      <Menu.Item key='currentFolder'>
        {t('conversation.workspace.searchScope.currentFolder', { folder: currentFolderLabel })}
      </Menu.Item>
    </Menu>
  );
  const searchModeMenu = (
    <Menu selectedKeys={[searchMode]} onClickMenuItem={(key) => setSearchMode(key as WorkspaceSearchMode)}>
      <Menu.Item key='all'>{t('conversation.workspace.searchMode.all')}</Menu.Item>
      <Menu.Item key='name'>{t('conversation.workspace.searchMode.name')}</Menu.Item>
      <Menu.Item key='content'>{t('conversation.workspace.searchMode.content')}</Menu.Item>
    </Menu>
  );

  return (
    <div className='px-12px'>
      {/* Search Input */}
      {(showSearch || searchText) && (
        <div className='py-8px workspace-toolbar-search'>
          <Input
            className='w-full workspace-search-input'
            ref={searchInputRef}
            placeholder={t('conversation.workspace.searchPlaceholder')}
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              onSearch(value);
            }}
            allowClear
            prefix={<Search theme='outline' size='14' fill={iconColors.primary} />}
          />
          <div className='mt-6px flex items-center gap-6px overflow-hidden'>
            <Dropdown droplist={searchScopeMenu} trigger='click' position='bl'>
              <Button
                size='mini'
                type='text'
                className='!px-4px min-w-0 flex-shrink-0'
                icon={<Search theme='outline' size='12' fill={iconColors.secondary} />}
              >
                <span className='block max-w-140px overflow-hidden text-ellipsis whitespace-nowrap'>{scopeLabel}</span>
              </Button>
            </Dropdown>
            <Dropdown droplist={searchModeMenu} trigger='click' position='bl'>
              <Button
                size='mini'
                type='text'
                className='!px-4px min-w-0 flex-shrink-0'
                icon={<Search theme='outline' size='12' fill={iconColors.secondary} />}
              >
                <span className='block max-w-100px overflow-hidden text-ellipsis whitespace-nowrap'>{modeLabel}</span>
              </Button>
            </Dropdown>
          </div>
        </div>
      )}

      {/* Border divider below search */}
      {!isWorkspaceCollapsed && (showSearch || searchText) && <div className='border-b border-b-base' />}

      {/* Directory name with collapse and action icons */}
      <div className='workspace-toolbar-row flex items-center justify-between gap-8px'>
        <div
          className='flex items-center gap-8px cursor-pointer flex-1 min-w-0'
          onClick={() => setIsWorkspaceCollapsed(!isWorkspaceCollapsed)}
        >
          <Down
            size={16}
            fill={iconColors.primary}
            className={`line-height-0 transition-transform duration-200 flex-shrink-0 ${isWorkspaceCollapsed ? '-rotate-90' : 'rotate-0'}`}
          />
          {temporaryWorkspaceDetails ? (
            <Popover
              content={temporaryWorkspaceDetails}
              trigger='click'
              position='bottom'
              title={t('conversation.workspace.temporaryDirectory')}
            >
              <Button
                type='text'
                size='mini'
                className='workspace-title-label min-w-0 max-w-full !p-0 !h-auto !bg-transparent !text-t-primary font-bold text-14px overflow-hidden text-ellipsis whitespace-nowrap hover:!text-[rgb(var(--primary-6))] [&_.arco-btn-content]:min-w-0 [&_.arco-btn-content]:overflow-hidden [&_.arco-btn-content]:text-ellipsis [&_.arco-btn-content]:whitespace-nowrap'
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                {workspaceDisplayName}
              </Button>
            </Popover>
          ) : (
            <span className='workspace-title-label font-bold text-14px text-t-primary overflow-hidden text-ellipsis whitespace-nowrap'>
              {workspaceDisplayName}
            </span>
          )}
        </div>
        <div className='workspace-toolbar-actions flex items-center gap-8px flex-shrink-0'>
          {!isElectronDesktop() && (
            <Dropdown droplist={workspaceUploadMenu} trigger='click' position='bl'>
              <span>
                <Plus
                  className='workspace-toolbar-icon-btn lh-[1] flex cursor-pointer'
                  theme='outline'
                  size='16'
                  fill={iconColors.secondary}
                />
              </span>
            </Dropdown>
          )}
          <Tooltip content={t('conversation.workspace.refresh')}>
            <span>
              <Refresh
                className={
                  loading
                    ? 'workspace-toolbar-icon-btn loading lh-[1] flex cursor-pointer'
                    : 'workspace-toolbar-icon-btn flex cursor-pointer'
                }
                theme='outline'
                size='16'
                fill={iconColors.secondary}
                onClick={() => refreshWorkspace()}
              />
            </span>
          </Tooltip>
        </div>
      </div>
      <UploadProgressBar source='workspace' />
    </div>
  );
};

export default WorkspaceToolbar;
