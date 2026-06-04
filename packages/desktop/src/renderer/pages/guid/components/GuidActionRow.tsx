/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMcpServer } from '@/common/config/storage';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import MobileActionSheet, {
  type MobileActionSheetEntry,
  type MobileActionSheetOption,
} from '@/renderer/components/chat/MobileActionSheet';
import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { supportsModeSwitch, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { getCleanFileNames, FileService } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { AvailableAgent } from '../types';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import PresetAgentTag, { type AgentSwitcherItem } from './PresetAgentTag';
import { Button, Checkbox, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Brain, Lightning, Plus, Shield, UploadOne } from '@icon-park/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

export type GuidMobileModelEntry = Pick<MobileActionSheetEntry, 'key' | 'label' | 'meta' | 'submenu'>;

type GuidActionRowProps = {
  // File handling
  files: string[];
  onFilesUploaded: (paths: string[]) => void;

  // Model selector node (rendered by parent)
  modelSelectorNode: React.ReactNode;
  mobileModelEntry?: GuidMobileModelEntry;

  // Agent mode
  selectedAgent: string | 'custom';
  effectiveModeAgent?: string;
  selectedMode: string;
  onModeSelect: (mode: string) => void;

  // Preset agent tag
  is_presetAgent: boolean;
  selectedAgentInfo: AvailableAgent | undefined;
  /**
   * Backend-merged preset catalog — drives the preset tag label lookup. Not
   * the ACP engine-config list (custom agents from the AgentRegistry).
   */
  assistants: Assistant[];
  localeKey: string;
  onClosePresetTag: () => void;
  agentLogo?: string | null;
  agentSwitcherItems?: AgentSwitcherItem[];
  onAgentSwitch?: (key: string) => void;
  hidePresetTag?: boolean;

  // Skills management
  allSkills: Array<{ name: string; description: string; isAuto: boolean }>;
  disabledBuiltinSkills: string[];
  enabledSkills: string[];
  onToggleSkill: (name: string, isAuto: boolean) => void;
  mcpServers: IMcpServer[];
  selectedMcpServerIds: string[];
  onToggleMcpServer: (serverId: string) => void;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesUploaded,
  modelSelectorNode,
  mobileModelEntry,
  selectedAgent,
  effectiveModeAgent,
  selectedMode,
  onModeSelect,
  is_presetAgent,
  selectedAgentInfo,
  assistants,
  localeKey,
  onClosePresetTag,
  agentLogo,
  agentSwitcherItems,
  onAgentSwitch,
  allSkills,
  disabledBuiltinSkills,
  enabledSkills,
  onToggleSkill,
  mcpServers,
  selectedMcpServerIds,
  onToggleMcpServer,
  hidePresetTag = false,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const modeBackend = effectiveModeAgent || selectedAgent;
  const showModeSwitch = supportsModeSwitch(modeBackend);
  const configOptionCount = (modelSelectorNode ? 1 : 0) + (showModeSwitch ? 1 : 0);
  const modeOptions = useAgentModesForBackend(modeBackend);

  // Browser file picker ref (WebUI only)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList);
        if (processed.length > 0) {
          onFilesUploaded(processed.map((f) => f.path));
        }
      } catch {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [onFilesUploaded, t]
  );

  const getModeDisplayLabel = useCallback(
    (mode: AgentModeOption): string => t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
    [t]
  );

  const isWebUI = !isElectronDesktop();

  const isSkillChecked = useCallback(
    (skill: { name: string; isAuto: boolean }) =>
      skill.isAuto ? !disabledBuiltinSkills.includes(skill.name) : enabledSkills.includes(skill.name),
    [disabledBuiltinSkills, enabledSkills]
  );

  const activeSkillCount = useMemo(() => allSkills.filter(isSkillChecked).length, [allSkills, isSkillChecked]);
  const activeMcpCount = selectedMcpServerIds.length;

  const openHostFileSelector = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then((uploadedFiles) => {
        if (uploadedFiles && uploadedFiles.length > 0) {
          onFilesUploaded(uploadedFiles);
        }
      })
      .catch((error) => {
        console.error('Failed to open file dialog:', error);
      });
  }, [onFilesUploaded]);

  const menuContent = (
    <Menu
      className='min-w-200px'
      onClickMenuItem={(key) => {
        if (key === 'file') {
          openHostFileSelector();
        } else if (key === 'device') {
          fileInputRef.current?.click();
        }
      }}
    >
      {isWebUI ? (
        <>
          <Menu.Item key='file'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.addFiles')}</span>
            </div>
          </Menu.Item>
          <Menu.Item key='device'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.myDevice')}</span>
            </div>
          </Menu.Item>
        </>
      ) : (
        <Menu.Item key='file'>
          <div className='flex items-center gap-8px'>
            <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
            <span>{t('common.fileAttach.addFiles')}</span>
          </div>
        </Menu.Item>
      )}
      {allSkills.length > 0 && (
        <Menu.SubMenu
          key='skills'
          title={
            <div className='flex items-center gap-8px'>
              <Lightning theme='filled' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('settings.capabilitiesTab.skills')} ({activeSkillCount}/{allSkills.length})
              </span>
            </div>
          }
          triggerProps={{
            popupStyle: {
              maxHeight: 360,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }}
        >
          {allSkills.map((skill) => (
            <Menu.Item
              key={`skill-${skill.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSkill(skill.name, skill.isAuto);
              }}
            >
              <Checkbox
                checked={isSkillChecked(skill)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onChange={() => onToggleSkill(skill.name, skill.isAuto)}
              >
                <span className='text-13px'>{skill.name}</span>
              </Checkbox>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
      {mcpServers.length > 0 && (
        <Menu.SubMenu
          key='mcp'
          title={
            <div className='flex items-center gap-8px'>
              <Shield theme='outline' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('mcp.label')} ({activeMcpCount}/{mcpServers.length})
              </span>
            </div>
          }
          triggerProps={{
            popupStyle: {
              maxHeight: 360,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }}
        >
          {mcpServers.map((server) => (
            <Menu.Item
              key={`mcp-${server.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMcpServer(server.id);
              }}
            >
              <Checkbox
                checked={selectedMcpServerIds.includes(server.id)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onChange={() => onToggleMcpServer(server.id)}
              >
                <span className='text-13px'>
                  {server.name}
                  {server.tools?.length ? ` (${server.tools.length} ${t('mcp.tools')})` : ''}
                </span>
              </Checkbox>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
    </Menu>
  );

  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const entries: MobileActionSheetEntry[] = [];
    if (mobileModelEntry?.submenu) {
      entries.push({
        ...mobileModelEntry,
        icon: <Brain theme='outline' size='16' />,
      });
    }

    if (showModeSwitch && modeOptions.length > 0) {
      const modeItems: MobileActionSheetOption[] = modeOptions.map((mode) => ({
        key: mode.value,
        label: getModeDisplayLabel(mode),
        description: mode.description,
        active: selectedMode === mode.value,
      }));
      const currentModeLabel =
        modeItems.find((option) => option.active)?.label ??
        getModeDisplayLabel(modeOptions[0] ?? { value: 'default', label: 'Default' });
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: currentModeLabel,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeItems,
          onSelect: onModeSelect,
        },
      });
    }

    const dividerBeforeAttach = entries.length > 0;
    entries.push({
      key: 'attach-files',
      icon: <UploadOne theme='outline' size='16' />,
      label: t('common.fileAttach.addFiles'),
      variant: 'muted',
      dividerBefore: dividerBeforeAttach,
      onClick: openHostFileSelector,
    });
    if (isWebUI) {
      entries.push({
        key: 'attach-device',
        icon: <UploadOne theme='outline' size='16' />,
        label: t('common.fileAttach.myDevice'),
        variant: 'muted',
        onClick: () => fileInputRef.current?.click(),
      });
    }

    if (allSkills.length > 0) {
      entries.push({
        key: 'skills',
        icon: <Lightning theme='filled' size='16' />,
        label: t('settings.capabilitiesTab.skills'),
        meta: `${activeSkillCount}/${allSkills.length}`,
        variant: 'muted',
        submenu: {
          title: t('settings.capabilitiesTab.skills'),
          options: allSkills.map((skill) => ({
            key: skill.name,
            label: skill.name,
            description: skill.description,
            active: isSkillChecked(skill),
          })),
          onSelect: (name) => {
            const skill = allSkills.find((item) => item.name === name);
            if (skill) onToggleSkill(skill.name, skill.isAuto);
          },
        },
      });
    }

    if (mcpServers.length > 0) {
      entries.push({
        key: 'mcp',
        icon: <Shield theme='outline' size='16' />,
        label: t('mcp.label'),
        meta: `${activeMcpCount}/${mcpServers.length}`,
        variant: 'muted',
        submenu: {
          title: t('mcp.label'),
          options: mcpServers.map((server) => ({
            key: server.id,
            label: server.name,
            description: server.tools?.length ? `${server.tools.length} ${t('mcp.tools')}` : undefined,
            active: selectedMcpServerIds.includes(server.id),
          })),
          onSelect: onToggleMcpServer,
        },
      });
    }

    return entries;
  }, [
    activeMcpCount,
    activeSkillCount,
    allSkills,
    getModeDisplayLabel,
    isMobile,
    isSkillChecked,
    isWebUI,
    mcpServers,
    mobileModelEntry,
    modeOptions,
    onModeSelect,
    onToggleMcpServer,
    onToggleSkill,
    openHostFileSelector,
    selectedMcpServerIds,
    selectedMode,
    showModeSwitch,
    t,
  ]);

  const renderPlusControl = () => {
    if (isMobile) {
      return (
        <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
          <Button
            type='secondary'
            shape='circle'
            className={isMobileSheetOpen ? styles.plusButtonRotate : ''}
            icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
            loading={uploading}
            disabled={uploading}
            onClick={() => setIsMobileSheetOpen(true)}
            data-testid='file-upload-btn'
          />
          {files.length > 0 && (
            <Tooltip
              className={'!max-w-max'}
              content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
            >
              <span className='text-t-primary'>File({files.length})</span>
            </Tooltip>
          )}
        </span>
      );
    }

    return (
      <Dropdown trigger='hover' onVisibleChange={setIsPlusDropdownOpen} droplist={menuContent}>
        <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
          <Button
            type='secondary'
            shape='circle'
            className={isPlusDropdownOpen ? styles.plusButtonRotate : ''}
            icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
            loading={uploading}
            disabled={uploading}
            data-testid='file-upload-btn'
          />
          {files.length > 0 && (
            <Tooltip
              className={'!max-w-max'}
              content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
            >
              <span className='text-t-primary'>File({files.length})</span>
            </Tooltip>
          )}
        </span>
      </Dropdown>
    );
  };

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionTools}>
        <div className={styles.actionEntry}>
          {renderPlusControl()}
          {isWebUI && (
            <input
              ref={fileInputRef}
              type='file'
              multiple
              style={{ display: 'none' }}
              onChange={handleLocalFileChange}
            />
          )}
        </div>
        {!isMobile && configOptionCount > 0 && (
          <div className={styles.actionConfigGroup}>
            {modelSelectorNode}

            {showModeSwitch && (
              <AgentModeSelector
                backend={modeBackend}
                compact
                initialMode={selectedMode}
                onModeSelect={onModeSelect}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={getModeDisplayLabel}
              />
            )}
          </div>
        )}

        {!hidePresetTag && is_presetAgent && selectedAgentInfo && (
          <div className={styles.actionPresetAgent}>
            <PresetAgentTag
              agentInfo={selectedAgentInfo}
              assistants={assistants}
              localeKey={localeKey}
              onClose={onClosePresetTag}
              agentLogo={agentLogo}
              agentSwitcherItems={agentSwitcherItems}
              onAgentSwitch={onAgentSwitch}
            />
          </div>
        )}
      </div>
      <div className={styles.actionSubmit}>
        {speechInputNode}
        <Button
          shape='circle'
          type='primary'
          loading={loading}
          disabled={isButtonDisabled}
          className='send-button-custom'
          style={{
            backgroundColor: isButtonDisabled ? undefined : '#000000',
            borderColor: isButtonDisabled ? undefined : '#000000',
          }}
          icon={<ArrowUp theme='filled' size='14' fill='white' strokeWidth={5} />}
          onClick={onSend}
          data-testid='guid-send-btn'
        />
      </div>
      {isMobile && (
        <MobileActionSheet
          open={isMobileSheetOpen}
          onClose={() => setIsMobileSheetOpen(false)}
          title={t('common.more', { defaultValue: 'More' })}
          entries={sheetEntries}
        />
      )}
    </div>
  );
};

export default GuidActionRow;
