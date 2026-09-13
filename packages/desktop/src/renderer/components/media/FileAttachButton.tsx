/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus, IConversationMcpStatusKind } from '@/common/config/storage';
import { Button, Message, Trigger } from '@arco-design/web-react';
import { FolderOpen, Lightning, Paperclip, Plus, Right, Shield } from '@icon-park/react';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useConversationCapabilities } from '@/renderer/hooks/chat/useConversationCapabilities';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { FileService } from '@/renderer/services/FileService';
import type { FileMetadata } from '@/renderer/services/FileService';
import AionInlineSearchInput from '@/renderer/components/base/AionInlineSearchInput';
import { emitter } from '@/renderer/utils/emitter';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface FileAttachButtonProps {
  openFileSelector: () => void;
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  loadedSkills?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
}

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  suffix?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
  disabled?: boolean;
}> = ({ icon, label, description, suffix, onClick, className = '', title, disabled }) => (
  <div
    className={`flex items-center gap-10px px-12px py-9px rounded-8px transition-colors text-14px text-t-primary select-none ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-fill-2'
    } ${className}`}
    onClick={disabled ? undefined : onClick}
    title={title}
    aria-disabled={disabled || undefined}
  >
    <span className='flex-shrink-0 inline-flex items-center justify-center color-#86909c w-18px leading-none'>
      {icon}
    </span>
    <span className='min-w-0 flex-1'>
      <span className='block leading-none'>{label}</span>
      {description ? <span className='mt-4px block text-12px leading-16px text-t-secondary'>{description}</span> : null}
    </span>
    {suffix}
  </div>
);

const MCP_STATUS_CLASS_NAME: Record<IConversationMcpStatusKind, string> = {
  loaded: 'text-[var(--color-success-6)]',
  failed: 'text-[var(--color-danger-6)]',
  unsupported: 'text-[var(--color-warning-6)]',
};

const buildLoadedMcpStatuses = (
  statuses?: IConversationMcpStatus[],
  legacyNames?: string[]
): IConversationMcpStatus[] => {
  if (Array.isArray(statuses) && statuses.length > 0) {
    return statuses;
  }

  return (legacyNames ?? []).map((name) => ({
    id: name,
    name,
    status: 'loaded',
  }));
};

const FileAttachButton: React.FC<FileAttachButtonProps> = ({
  openFileSelector,
  onLocalFilesAdded,
  loadedSkills,
  loadedMcpStatuses,
}) => {
  const conversationContext = useConversationContextSafe();
  const layout = useLayoutContext();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [addSkillsOpen, setAddSkillsOpen] = useState(false);
  const [addMcpOpen, setAddMcpOpen] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState('');
  const [mcpQuery, setMcpQuery] = useState('');

  const skillNames = loadedSkills ?? conversationContext?.loadedSkills ?? [];
  const mcpStatuses = buildLoadedMcpStatuses(
    loadedMcpStatuses ?? conversationContext?.loadedMcpStatuses,
    conversationContext?.loadedMcpServers
  );
  const { availableSkills, availableMcpServers, selectedSkills, selectedMcpServerIds, addSkill, addMcpServer } =
    useConversationCapabilities({
      conversationId: conversationContext?.conversation_id ?? '',
      // The WebUI browser and Electron desktop share the same capability
      // picker. Only the mobile send box owns its visible picker; this
      // component remains a hidden slot there, but still needs the catalog
      // available when the WebUI desktop layout renders it.
      enabled: Boolean(conversationContext?.conversation_id) && !layout?.isMobile,
      loadedSkills: skillNames,
      loadedMcpServerIds: mcpStatuses.map((item) => item.id),
      loadedMcpServerNames: mcpStatuses.map((item) => item.name),
    });
  const handleSkillClick = useCallback((name: string) => {
    setOpen(false);
    emitter.emit('sendbox.fill', `/${name} `);
  }, []);

  const handleOpenMcpSettings = useCallback(() => {
    setOpen(false);
    setSkillsOpen(false);
    setMcpOpen(false);
    void navigate('/settings/tools');
  }, [navigate]);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversation_id);
        if (processed.length > 0) onLocalFilesAdded(processed);
      } catch {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      e.target.value = '';
    },
    [conversationContext?.conversation_id, onLocalFilesAdded, t]
  );

  const isDesktop = isElectronDesktop();
  const hasSkills = skillNames.length > 0;
  const hasMcpServers = mcpStatuses.length > 0;
  // Keep the add rows visible even when every catalog item is already in the
  // conversation. Selected entries are disabled in the submenu; hiding the
  // row made it look as if MCP/Skills were unsupported on that session.
  const hasAvailableSkills = availableSkills.length > 0;
  const hasAvailableMcpServers = availableMcpServers.length > 0;
  const normalizedSkillsQuery = skillsQuery.trim().toLowerCase();
  const normalizedMcpQuery = mcpQuery.trim().toLowerCase();
  const filteredAvailableSkills = useMemo(
    () =>
      availableSkills.filter((skill) => {
        if (!normalizedSkillsQuery) return true;
        return `${skill.name} ${skill.description}`.toLowerCase().includes(normalizedSkillsQuery);
      }),
    [availableSkills, normalizedSkillsQuery]
  );
  const filteredAvailableMcpServers = useMemo(
    () =>
      availableMcpServers.filter((server) => {
        if (!normalizedMcpQuery) return true;
        return `${server.name} ${server.description ?? ''}`.toLowerCase().includes(normalizedMcpQuery);
      }),
    [availableMcpServers, normalizedMcpQuery]
  );
  const plusIcon = <Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />;

  if (isDesktop && !hasSkills && !hasMcpServers && !hasAvailableSkills && !hasAvailableMcpServers) {
    return (
      <Button
        type='secondary'
        shape='circle'
        icon={plusIcon}
        onClick={openFileSelector}
        data-testid='aionrs-attach-folder-btn'
      />
    );
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-bg-2, #fff)',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
    border: '1px solid var(--color-border-1, #e5e6eb)',
    padding: '6px 0',
    minWidth: 220,
    zIndex: 1050,
  };
  const scrollablePanelStyle: React.CSSProperties = {
    ...cardStyle,
    maxHeight: 'min(60vh, 480px)',
    overflowY: 'auto',
  };

  const skillsPanel = (
    <div style={{ ...scrollablePanelStyle, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
      {skillNames.map((name) => (
        <MenuItem
          key={name}
          icon={<Lightning theme='outline' size={15} strokeWidth={2.5} />}
          label={name}
          onClick={() => handleSkillClick(name)}
          className='mx-6px'
        />
      ))}
    </div>
  );

  const mcpPanel = (
    <div
      style={{
        ...scrollablePanelStyle,
        minWidth: 220,
        width: 'min(320px, calc(100vw - 96px))',
        maxWidth: 320,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {mcpStatuses.map((item) => (
        <MenuItem
          key={`${item.id}-${item.status}`}
          icon={<Shield theme='outline' size={15} strokeWidth={2.5} />}
          label={item.name}
          suffix={
            item.status === 'loaded' ? undefined : (
              <span className={`text-12px leading-none ${MCP_STATUS_CLASS_NAME[item.status]}`}>
                {t(`conversation.mcp.status.${item.status}` as const)}
              </span>
            )
          }
          className='mx-6px cursor-default hover:bg-transparent'
          title={item.reason}
        />
      ))}
      <div style={{ margin: '4px 12px', height: 1, backgroundColor: 'var(--color-border-1, #e5e6eb)' }} />
      <div className='px-12px py-8px'>
        <div className='text-12px leading-16px text-t-secondary whitespace-normal break-words'>
          {t('conversation.mcp.managementHint', {
            defaultValue:
              'If an MCP looks abnormal, it is usually caused by the MCP JSON configuration. Go to Tools settings and test it there.',
          })}
        </div>
        <Button
          type='text'
          size='mini'
          className='mt-6px h-auto! px-0! text-12px! inline-flex! items-center! gap-4px!'
          onClick={handleOpenMcpSettings}
        >
          <span className='leading-none'>
            {t('conversation.mcp.openSettings', {
              defaultValue: 'Open Tools settings',
            })}
          </span>
          <span className='inline-flex h-12px w-12px flex-shrink-0 items-center justify-center'>
            <Right theme='outline' size={12} strokeWidth={3} className='block' />
          </span>
        </Button>
      </div>
    </div>
  );

  const addSkillsPanel = (
    <div
      style={{
        ...scrollablePanelStyle,
        width: 'min(420px, calc(100vw - 32px))',
        minWidth: 280,
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='px-8px pb-6px'>
        <AionInlineSearchInput
          value={skillsQuery}
          onChange={setSkillsQuery}
          placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
          data-testid='conversation-skill-search'
        />
      </div>
      {filteredAvailableSkills.length === 0 ? (
        <div className='px-12px py-12px text-12px text-t-secondary'>
          {t('settings.skillsHub.noSearchResults', { defaultValue: 'No matching skills.' })}
        </div>
      ) : (
        filteredAvailableSkills.map((skill) => {
          const selected = selectedSkills.includes(skill.name);
          return (
            <MenuItem
              key={skill.name}
              icon={<Lightning theme='outline' size={15} strokeWidth={2.5} />}
              label={skill.name}
              description={skill.description}
              disabled={selected}
              onClick={() => {
                void addSkill(skill.name)
                  .then(() => Message.success(t('settings.skillAdded', { name: skill.name })))
                  .catch(() => Message.error(t('agent.config.failed')));
              }}
              className='mx-6px'
            />
          );
        })
      )}
    </div>
  );

  const addMcpPanel = (
    <div
      style={{
        ...scrollablePanelStyle,
        width: 'min(420px, calc(100vw - 32px))',
        minWidth: 280,
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='px-8px pb-6px'>
        <AionInlineSearchInput
          value={mcpQuery}
          onChange={setMcpQuery}
          placeholder={t('mcp.searchServers', { defaultValue: 'Search servers...' })}
          data-testid='conversation-mcp-search'
        />
      </div>
      {filteredAvailableMcpServers.length === 0 ? (
        <div className='px-12px py-12px text-12px text-t-secondary'>
          {t('mcp.noServersFound', { defaultValue: 'No servers found matching your criteria' })}
        </div>
      ) : (
        filteredAvailableMcpServers.map((server) => {
          const selected = selectedMcpServerIds.includes(server.id);
          return (
            <MenuItem
              key={server.id}
              icon={<Shield theme='outline' size={15} strokeWidth={2.5} />}
              label={server.name}
              description={server.description ?? undefined}
              disabled={selected}
              onClick={() => {
                void addMcpServer(server.id)
                  .then(() => Message.success(t('common.added', { defaultValue: 'Added' })))
                  .catch(() => Message.error(t('agent.config.failed')));
              }}
              className='mx-6px'
            />
          );
        })
      )}
    </div>
  );

  const menu = (
    <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
      {/* Loaded items stay above file actions so the session snapshot is visible */}
      {(hasMcpServers || hasSkills) && (
        <>
          {hasMcpServers && (
            <div className='px-6px'>
              <Trigger
                popup={() => mcpPanel}
                trigger='hover'
                position='right'
                popupVisible={mcpOpen}
                onVisibleChange={setMcpOpen}
                mouseEnterDelay={100}
                mouseLeaveDelay={150}
              >
                <div>
                  <MenuItem
                    icon={<Shield theme='outline' size={15} strokeWidth={2.5} />}
                    label={`${t('conversation.mcp.selected', { defaultValue: 'Selected MCP' })} · ${mcpStatuses.length}`}
                    suffix={<Right theme='outline' size={12} strokeWidth={3} style={{ color: '#c9cdd4' }} />}
                  />
                </div>
              </Trigger>
            </div>
          )}
          {hasSkills && (
            <div className='px-6px'>
              <Trigger
                popup={() => skillsPanel}
                trigger='hover'
                position='right'
                popupVisible={skillsOpen}
                onVisibleChange={setSkillsOpen}
                mouseEnterDelay={100}
                mouseLeaveDelay={150}
              >
                <div>
                  <MenuItem
                    icon={<Lightning theme='outline' size={15} strokeWidth={2.5} />}
                    label={`${t('common.selectedSkills', { defaultValue: 'Selected skills' })} · ${skillNames.length}`}
                    suffix={<Right theme='outline' size={12} strokeWidth={3} style={{ color: '#c9cdd4' }} />}
                  />
                </div>
              </Trigger>
            </div>
          )}
          <div style={{ margin: '4px 12px', height: 1, backgroundColor: 'var(--color-border-1, #e5e6eb)' }} />
        </>
      )}

      {(hasAvailableMcpServers || hasAvailableSkills) && (
        <>
          {hasAvailableMcpServers && (
            <div className='px-6px'>
              <Trigger
                popup={() => addMcpPanel}
                trigger='hover'
                position='right'
                popupVisible={addMcpOpen}
                onVisibleChange={setAddMcpOpen}
                mouseEnterDelay={100}
                mouseLeaveDelay={150}
              >
                <div>
                  <MenuItem
                    icon={<Shield theme='outline' size={15} strokeWidth={2.5} />}
                    label={t('mcp.addServer', { defaultValue: 'Add MCP server' })}
                    suffix={<Right theme='outline' size={12} strokeWidth={3} style={{ color: '#c9cdd4' }} />}
                  />
                </div>
              </Trigger>
            </div>
          )}
          {hasAvailableSkills && (
            <div className='px-6px'>
              <Trigger
                popup={() => addSkillsPanel}
                trigger='hover'
                position='right'
                popupVisible={addSkillsOpen}
                onVisibleChange={setAddSkillsOpen}
                mouseEnterDelay={100}
                mouseLeaveDelay={150}
              >
                <div>
                  <MenuItem
                    icon={<Lightning theme='outline' size={15} strokeWidth={2.5} />}
                    label={t('settings.addSkills', { defaultValue: 'Add Skills' })}
                    suffix={<Right theme='outline' size={12} strokeWidth={3} style={{ color: '#c9cdd4' }} />}
                  />
                </div>
              </Trigger>
            </div>
          )}
          <div style={{ margin: '4px 12px', height: 1, backgroundColor: 'var(--color-border-1, #e5e6eb)' }} />
        </>
      )}

      {/* 文件操作最常用，在最下（离 + 最近） */}
      <div className='px-6px'>
        {!isDesktop && (
          <MenuItem
            icon={<FolderOpen theme='outline' size={15} strokeWidth={2.5} />}
            label={t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' })}
            onClick={() => {
              fileInputRef.current?.click();
              setOpen(false);
            }}
          />
        )}
        <MenuItem
          icon={<Paperclip theme='outline' size={15} strokeWidth={2.5} />}
          label={t('common.fileAttach.addFiles', { defaultValue: 'Add files' })}
          onClick={() => {
            openFileSelector();
            setOpen(false);
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      <Trigger
        popup={() => menu}
        trigger='click'
        position='tl'
        popupVisible={open}
        onVisibleChange={setOpen}
        clickToClose
        popupAlign={{ bottom: 8 }}
      >
        <Button
          type='secondary'
          shape='circle'
          icon={plusIcon}
          loading={uploading}
          disabled={uploading}
          data-testid='aionrs-attach-folder-btn'
        />
      </Trigger>
      <input
        ref={fileInputRef}
        type='file'
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalFileChange}
        data-testid='aionrs-file-upload-input'
      />
    </>
  );
};

export default FileAttachButton;
