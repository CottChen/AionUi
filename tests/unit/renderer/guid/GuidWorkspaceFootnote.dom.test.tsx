/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const createProject = vi.fn<(params: { name: string }) => Promise<{ path: string }>>();
vi.mock('@/common', () => ({
  ipcBridge: {
    project: { create: { invoke: (params: { name: string }) => createProject(params) } },
    dialog: { showOpen: { invoke: vi.fn() } },
  },
}));

const addRecentWorkspace = vi.fn();
vi.mock('@/renderer/components/workspace', () => ({
  addRecentWorkspace: (path: string) => addRecentWorkspace(path),
  getRecentWorkspaces: () => [],
}));
vi.mock('@/renderer/components/base', () => ({
  AionInlineSearchInput: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => <input {...props} ref={ref} />
  ),
}));

import GuidWorkspaceFootnote from '@/renderer/pages/guid/components/GuidWorkspaceFootnote';

beforeEach(() => {
  createProject.mockReset();
  addRecentWorkspace.mockReset();
  vi.spyOn(Message, 'error').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'warning').mockImplementation(() => '' as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openCreateDialog = async (): Promise<HTMLInputElement> => {
  fireEvent.click(screen.getByText('guid.workspace.workInProject'));
  fireEvent.click(await screen.findByText('guid.workspace.createProject'));
  return screen.getByPlaceholderText('guid.workspace.createProjectPlaceholder');
};

describe('GuidWorkspaceFootnote managed project creation', () => {
  it('selects and remembers the managed directory returned by the backend', async () => {
    createProject.mockResolvedValue({ path: '/data/aionui/projects/知识库' });
    const onSelectWorkspace = vi.fn();
    render(<GuidWorkspaceFootnote workspaceDir='' onSelectWorkspace={onSelectWorkspace} onClearWorkspace={vi.fn()} />);

    const input = await openCreateDialog();
    fireEvent.change(input, { target: { value: '  知识库  ' } });
    fireEvent.click(screen.getByText('确定'));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: '知识库' }));
    expect(addRecentWorkspace).toHaveBeenCalledWith('/data/aionui/projects/知识库');
    expect(onSelectWorkspace).toHaveBeenCalledWith('/data/aionui/projects/知识库');
  });

  it('keeps the current selection unchanged when project creation fails', async () => {
    createProject.mockRejectedValue({ code: 'project_directory_exists' });
    const onSelectWorkspace = vi.fn();
    render(<GuidWorkspaceFootnote workspaceDir='' onSelectWorkspace={onSelectWorkspace} onClearWorkspace={vi.fn()} />);

    const input = await openCreateDialog();
    fireEvent.change(input, { target: { value: 'existing' } });
    fireEvent.click(screen.getByText('确定'));

    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('guid.workspace.projectAlreadyExists'));
    expect(onSelectWorkspace).not.toHaveBeenCalled();
    expect(addRecentWorkspace).not.toHaveBeenCalled();
  });
});