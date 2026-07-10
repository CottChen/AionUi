/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceContextMenu from '@/renderer/pages/conversation/Workspace/components/WorkspaceContextMenu';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';

const platformState = {
  isElectron: false,
};

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platformState.isElectron,
}));

const node: IDirOrFile = {
  name: 'notes.md',
  fullPath: '/workspace/notes.md',
  relativePath: 'notes.md',
  isDir: false,
  isFile: true,
};

const t = (key: string) => key;

const renderMenu = () =>
  render(
    <WorkspaceContextMenu
      visible
      style={{ top: 10, left: 10 }}
      node={node}
      t={t}
      handleAddToChat={vi.fn()}
      handleOpenNode={vi.fn()}
      handleRevealNode={vi.fn()}
      handlePreviewFile={vi.fn()}
      handleDownloadFile={vi.fn()}
      handleDeleteNode={vi.fn()}
      handleSearchInFolder={vi.fn()}
      openRenameModal={vi.fn()}
      closeContextMenu={vi.fn()}
    />
  );

describe('WorkspaceContextMenu', () => {
  beforeEach(() => {
    platformState.isElectron = false;
  });

  it('hides system file actions in WebUI', () => {
    renderMenu();

    expect(screen.queryByText('conversation.workspace.contextMenu.open')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.workspace.contextMenu.openLocation')).not.toBeInTheDocument();
    expect(screen.getByText('conversation.workspace.contextMenu.preview')).toBeInTheDocument();
    expect(screen.getByText('conversation.workspace.contextMenu.download')).toBeInTheDocument();
  });

  it('shows system file actions in Electron', () => {
    platformState.isElectron = true;

    renderMenu();

    expect(screen.getByText('conversation.workspace.contextMenu.open')).toBeInTheDocument();
    expect(screen.getByText('conversation.workspace.contextMenu.openLocation')).toBeInTheDocument();
  });
});
