import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: testState.isMobile }),
}));

vi.mock('@/renderer/pages/conversation/components/ConversationTitleMinimap', () => ({
  default: () => <span data-testid='conversation-search-trigger' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ChatTitleEditor from '@/renderer/pages/conversation/components/ChatTitleEditor';

const renderTitleEditor = (editingTitle = false) =>
  render(
    <ChatTitleEditor
      editingTitle={editingTitle}
      titleDraft='Conversation title'
      setTitleDraft={vi.fn()}
      setEditingTitle={vi.fn()}
      renameLoading={false}
      canRenameTitle={false}
      submitTitleRename={vi.fn().mockResolvedValue(undefined)}
      titleAreaMaxWidth={480}
      title='Conversation title'
      conversation_id='conversation-1'
    />
  );

describe('conversation title search entry', () => {
  afterEach(() => {
    cleanup();
    testState.isMobile = false;
  });

  it('keeps the search entry visible on mobile without requiring hover', () => {
    testState.isMobile = true;

    renderTitleEditor();

    const slot = screen.getByTestId('conversation-search-trigger').parentElement?.parentElement;
    expect(slot?.className).toContain('w-40px');
    expect(slot?.className).toContain('opacity-100');
  });

  it('preserves the hover-revealed search entry on desktop', () => {
    renderTitleEditor();

    const slot = screen.getByTestId('conversation-search-trigger').parentElement?.parentElement;
    expect(slot?.className).toContain('w-0');
    expect(slot?.className).toContain('group-hover:w-40px');
  });

  it('hides the search entry while the title is being edited', () => {
    renderTitleEditor(true);

    expect(screen.queryByTestId('conversation-search-trigger')).toBeNull();
  });
});
