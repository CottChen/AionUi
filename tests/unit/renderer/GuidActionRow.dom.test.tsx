/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression coverage for the Guid action row responsive split:
 * mobile keeps core actions visible and marks long config labels for compact
 * styling; desktop keeps the same inline config controls without the marker.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LayoutContext } from '@/renderer/hooks/context/LayoutContext';
import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';

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

const defaultProps = {
  files: [],
  onFilesUploaded: vi.fn(),
  modelSelectorNode: <div data-testid='inline-model-selector'>Inline model selector</div>,
  modeBackend: 'codex',
  selectedMode: 'full-access',
  dynamicModes: [
    { value: 'read-only', label: 'Read Only' },
    { value: 'full-access', label: 'Full Access' },
  ],
  onModeSelect: vi.fn(),
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
  it('marks inline config controls for compact mobile styling', () => {
    renderActionRow(true);

    expect(screen.getByTestId('inline-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('inline-agent-mode')).toBeInTheDocument();
    expect(screen.getByTestId('inline-model-selector').parentElement).toHaveAttribute('data-mobile', 'true');
  });

  it('keeps inline model and permission controls on desktop', () => {
    renderActionRow(false);

    expect(screen.getByTestId('inline-model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('inline-agent-mode')).toBeInTheDocument();
    expect(screen.getByTestId('inline-model-selector').parentElement).not.toHaveAttribute('data-mobile');
  });
});
