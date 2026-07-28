/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WorkspaceToolbar from '@/renderer/pages/conversation/Workspace/components/WorkspaceToolbar';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
  isElectronDesktop: vi.fn(),
}));

vi.mock('@/renderer/utils/platform', () => platformMocks);

vi.mock('@/renderer/components/media/UploadProgressBar', () => ({
  default: () => null,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span />,
  Plus: ({ onClick, ...props }: { onClick?: () => void; 'data-testid'?: string }) => (
    <button type='button' onClick={onClick} data-testid={props['data-testid']} />
  ),
  Refresh: ({ onClick }: { onClick?: () => void }) => <button type='button' onClick={onClick} />,
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(({ children }: { children?: ReactNode }) => <div>{children}</div>, {
    Item: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  });

  return {
    Button: ({ children }: { children?: ReactNode }) => <button type='button'>{children}</button>,
    Dropdown: ({ children }: { children?: ReactNode }) => <>{children}</>,
    Menu,
    Popover: ({ children }: { children?: ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

const t = ((key: string) => key) as never;

const createProps = () => ({
  t,
  isWorkspaceCollapsed: false,
  setIsWorkspaceCollapsed: vi.fn(),
  isTemporaryWorkspace: false,
  workspacePath: '/workspace',
  workspaceDisplayName: 'workspace',
  loading: false,
  refreshWorkspace: vi.fn(),
  handleSelectHostFiles: vi.fn(),
  handleUploadDeviceFiles: vi.fn(),
  setShowHostFileSelector: vi.fn(),
});

describe('WorkspaceToolbar upload action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the host file picker from the desktop workspace toolbar', () => {
    platformMocks.isElectronDesktop.mockReturnValue(true);
    const props = createProps();

    render(<WorkspaceToolbar {...props} />);
    fireEvent.click(screen.getByTestId('workspace-upload-button'));

    expect(props.handleSelectHostFiles).toHaveBeenCalledOnce();
  });

  it('does not bypass the WebUI upload menu', () => {
    platformMocks.isElectronDesktop.mockReturnValue(false);
    const props = createProps();

    render(<WorkspaceToolbar {...props} />);
    fireEvent.click(screen.getByTestId('workspace-upload-button'));

    expect(props.handleSelectHostFiles).not.toHaveBeenCalled();
    expect(props.handleUploadDeviceFiles).not.toHaveBeenCalled();
  });
});
