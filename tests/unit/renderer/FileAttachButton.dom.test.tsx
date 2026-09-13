/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';

const mocks = vi.hoisted(() => ({
  useConversationCapabilities: vi.fn(),
  addSkill: vi.fn(),
  addMcpServer: vi.fn(),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: 'conversation-1',
    loadedSkills: ['existing-skill'],
    loadedMcpStatuses: [{ id: 'existing-mcp', name: 'Existing MCP', status: 'loaded' }],
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/chat/useConversationCapabilities', () => ({
  useConversationCapabilities: mocks.useConversationCapabilities,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

vi.mock('@/renderer/services/FileService', () => ({
  FileService: { processDroppedFiles: vi.fn() },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@icon-park/react', () => {
  const Icon = () => <span aria-hidden='true' />;
  return {
    FolderOpen: Icon,
    Lightning: Icon,
    Paperclip: Icon,
    Plus: Icon,
    Right: Icon,
    Shield: Icon,
  };
});

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button {...props}>
      {icon}
      {children}
    </button>
  ),
  Message: { success: vi.fn(), error: vi.fn() },
  Trigger: ({ children, popup }: { children: React.ReactNode; popup: () => React.ReactNode }) => (
    <>
      {children}
      {popup()}
    </>
  ),
}));

describe('FileAttachButton WebUI capability picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addSkill.mockResolvedValue(undefined);
    mocks.addMcpServer.mockResolvedValue(undefined);
    mocks.useConversationCapabilities.mockReturnValue({
      availableSkills: [
        { name: 'existing-skill', description: 'Already loaded' },
        { name: 'new-skill', description: 'Available to add' },
      ],
      availableMcpServers: [
        { id: 'existing-mcp', name: 'Existing MCP', description: 'Already loaded' },
        { id: 'new-mcp', name: 'New MCP', description: 'Available to add' },
      ],
      selectedSkills: ['existing-skill'],
      selectedMcpServerIds: ['existing-mcp'],
      addSkill: mocks.addSkill,
      addMcpServer: mocks.addMcpServer,
    });
  });

  it('loads capabilities in browser WebUI and disables duplicate additions', () => {
    const view = render(<FileAttachButton openFileSelector={vi.fn()} />);

    expect(mocks.useConversationCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        enabled: true,
      })
    );

    const disabledItems = Array.from(view.container.querySelectorAll('[aria-disabled="true"]'));
    const existingSkill = disabledItems.find((item) => item.textContent?.includes('existing-skill'));
    const existingMcp = disabledItems.find((item) => item.textContent?.includes('Existing MCP'));

    expect(existingSkill).toBeTruthy();
    expect(existingMcp).toBeTruthy();

    fireEvent.click(existingSkill!);
    fireEvent.click(existingMcp!);

    expect(mocks.addSkill).not.toHaveBeenCalled();
    expect(mocks.addMcpServer).not.toHaveBeenCalled();
  });
});
