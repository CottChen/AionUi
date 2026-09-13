/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationCapabilities } from '@/renderer/hooks/chat/useConversationCapabilities';

const { listSkillsMock, listMcpMock, listExtensionMcpMock, updateCapabilitiesMock } = vi.hoisted(() => ({
  listSkillsMock: vi.fn(),
  listMcpMock: vi.fn(),
  listExtensionMcpMock: vi.fn(),
  updateCapabilitiesMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: { listAvailableSkills: { invoke: listSkillsMock } },
    mcpService: { listServers: { invoke: listMcpMock } },
    extensions: { getMcpServers: { invoke: listExtensionMcpMock } },
    conversation: { updateCapabilities: { invoke: updateCapabilitiesMock } },
  },
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: async () => {
    const servers = await listMcpMock();
    return { userServers: servers, builtinServers: [], allServers: servers };
  },
}));

describe('useConversationCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSkillsMock.mockResolvedValue([
      { name: 'review', description: 'Review code', is_auto_inject: true },
      { name: 'slides', description: 'Create slides', is_auto_inject: false },
    ]);
    listMcpMock.mockResolvedValue([
      { id: 'docs', name: 'Docs', builtin: false },
      { id: 'builtin', name: 'Builtin', builtin: true },
    ]);
    listExtensionMcpMock.mockResolvedValue([
      {
        id: 'extension-docs',
        name: 'Extension Docs',
        description: 'Provided by an extension',
        transport: { type: 'http', url: 'https://example.test/mcp' },
      },
    ]);
    updateCapabilitiesMock.mockResolvedValue({ id: 'conv-1' });
  });

  it('loads mobile catalogs while hiding builtin MCP entries', async () => {
    const { result } = renderHook(() =>
      useConversationCapabilities({
        conversationId: 'conv-1',
        enabled: true,
        loadedSkills: ['review'],
        loadedMcpServerIds: [],
      })
    );

    await waitFor(() => expect(result.current.availableSkills).toHaveLength(2));

    expect(result.current.availableMcpServers.map((server) => server.id)).toEqual(['docs']);
    expect(result.current.selectedSkills).toEqual(['review']);
  });

  it('keeps the conversation catalog limited to backend-persisted MCP servers', async () => {
    const { result } = renderHook(() =>
      useConversationCapabilities({
        conversationId: 'conv-1',
        enabled: true,
      })
    );

    await waitFor(() => expect(result.current.availableMcpServers).toHaveLength(1));
    expect(result.current.availableMcpServers.map((server) => server.id)).toEqual(['docs']);
  });

  it('resolves legacy MCP names to current server ids before adding another server', async () => {
    const { result } = renderHook(() =>
      useConversationCapabilities({
        conversationId: 'conv-1',
        enabled: true,
        loadedSkills: [],
        loadedMcpServerIds: ['Docs'],
        loadedMcpServerNames: ['Docs'],
      })
    );

    await waitFor(() => expect(result.current.selectedMcpServerIds).toEqual(['docs']));
    await act(async () => {
      await result.current.addMcpServer('another');
    });

    expect(updateCapabilitiesMock).toHaveBeenCalledWith({
      id: 'conv-1',
      skills_to_add: [],
      mcp_server_ids_to_add: ['another'],
    });
  });

  it('serializes added capabilities and preserves prior selections', async () => {
    const { result } = renderHook(() =>
      useConversationCapabilities({
        conversationId: 'conv-1',
        enabled: true,
        loadedSkills: ['review'],
        loadedMcpServerIds: [],
      })
    );

    await waitFor(() => expect(result.current.availableSkills).toHaveLength(2));

    await act(async () => {
      await result.current.addSkill('slides');
      await result.current.addMcpServer('docs');
    });

    expect(updateCapabilitiesMock).toHaveBeenNthCalledWith(1, {
      id: 'conv-1',
      skills_to_add: ['slides'],
      mcp_server_ids_to_add: [],
    });
    expect(updateCapabilitiesMock).toHaveBeenNthCalledWith(2, {
      id: 'conv-1',
      skills_to_add: [],
      mcp_server_ids_to_add: ['docs'],
    });
  });

  it('rolls back an optimistic selection when the backend rejects the update', async () => {
    updateCapabilitiesMock.mockRejectedValueOnce(new Error('busy'));
    const { result } = renderHook(() =>
      useConversationCapabilities({
        conversationId: 'conv-1',
        enabled: true,
        loadedSkills: ['review'],
        loadedMcpServerIds: [],
      })
    );

    await waitFor(() => expect(result.current.availableSkills).toHaveLength(2));

    await expect(
      act(async () => {
        await result.current.addSkill('slides');
      })
    ).rejects.toThrow('busy');

    expect(result.current.selectedSkills).toEqual(['review']);
  });
});
