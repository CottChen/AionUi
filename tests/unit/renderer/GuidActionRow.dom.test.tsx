/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression coverage for the Guid action row responsive split:
 * mobile keeps core actions visible and moves long config labels into the
 * existing action sheet pattern; desktop keeps inline config controls.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LayoutContext } from '@/renderer/hooks/context/LayoutContext';
import GuidActionRow, { type GuidMobileModelEntry } from '@/renderer/pages/guid/components/GuidActionRow';

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

vi.mock('@/renderer/services/FileService', () => ({
  FileService: {
    processDroppedFiles: vi.fn().mockResolvedValue([]),
  },
  getCleanFileNames: (files: string[]) => files,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='inline-agent-mode'>Permission inline</div>,
}));

vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  __esModule: true,
  default: ({
    open,
    entries,
  }: {
    open: boolean;
    entries: Array<{
      key: string;
      label: React.ReactNode;
      meta?: React.ReactNode;
      submenu?: { options: Array<{ key: string; label: React.ReactNode }> };
    }>;
  }) =>
    open ? (
      <div data-testid='mobile-action-sheet'>
        {entries.map((entry) => (
          <section key={entry.key} data-testid={`sheet-entry-${entry.key}`}>
            <span>{entry.label}</span>
            {entry.meta && <span>{entry.meta}</span>}
            {entry.submenu?.options.map((option) => (
              <span key={option.key}>{option.label}</span>
            ))}
          </section>
        ))}
      </div>
    ) : null,
}));

vi.mock('@/renderer/hooks/agent/useAgentModesForBackend', () => ({
  useAgentModesForBackend: () => [
    { value: 'read-only', label: 'Read Only' },
    { value: 'full-access', label: 'Full Access' },
  ],
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Checkbox: ({
    children,
    checked,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & { children?: React.ReactNode }) => (
    <label>
      <input type='checkbox' checked={checked} readOnly {...props} />
      {children}
    </label>
  ),
  Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Menu: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SubMenu: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) => (
      <div>
        {title}
        {children}
      </div>
    ),
  }),
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => <span data-testid='icon-arrow-up' />,
  Brain: () => <span data-testid='icon-brain' />,
  Lightning: () => <span data-testid='icon-lightning' />,
  Plus: () => <span data-testid='icon-plus' />,
  Shield: () => <span data-testid='icon-shield' />,
  UploadOne: () => <span data-testid='icon-upload' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

const mobileModelEntry: GuidMobileModelEntry = {
  key: 'model',
  label: 'Model',
  meta: 'a-very-long-provider-model-name-that-should-not-live-inline-on-mobile',
  submenu: {
    title: 'Model',
    options: [
      {
        key: 'long-model',
        label: 'a-very-long-provider-model-name-that-should-not-live-inline-on-mobile',
        active: true,
      },
    ],
    onSelect: vi.fn(),
  },
};

const defaultProps = {
  files: [],
  onFilesUploaded: vi.fn(),
  modelSelectorNode: <div data-testid='inline-model-selector'>Inline model selector</div>,
  mobileModelEntry,
  selectedAgent: 'codex' as const,
  effectiveModeAgent: 'codex',
  selectedMode: 'full-access',
  onModeSelect: vi.fn(),
  is_presetAgent: false,
  selectedAgentInfo: undefined,
  assistants: [],
  localeKey: 'en',
  onClosePresetTag: vi.fn(),
  allSkills: [],
  disabledBuiltinSkills: [],
  enabledSkills: [],
  onToggleSkill: vi.fn(),
  mcpServers: [],
  selectedMcpServerIds: [],
  onToggleMcpServer: vi.fn(),
  hidePresetTag: true,
  loading: false,
  isButtonDisabled: false,
  onSend: vi.fn(),
};

const renderActionRow = (isMobile: boolean) =>
  render(
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: true, setSiderCollapsed: vi.fn() }}>
      <GuidActionRow {...defaultProps} />
    </LayoutContext.Provider>
  );

describe('GuidActionRow responsive config controls', () => {
  it('moves model and permission controls into the mobile action sheet', () => {
    renderActionRow(true);

    expect(screen.queryByTestId('inline-model-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inline-agent-mode')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('file-upload-btn'));

    expect(screen.getByTestId('mobile-action-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-entry-model')).toHaveTextContent(
      'a-very-long-provider-model-name-that-should-not-live-inline-on-mobile'
    );
    expect(screen.getByTestId('sheet-entry-permission')).toHaveTextContent('Full Access');
  });

  it('keeps inline model and permission controls on desktop', () => {
    renderActionRow(false);

    expect(screen.getByTestId('inline-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('inline-agent-mode')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-action-sheet')).not.toBeInTheDocument();
  });
});
