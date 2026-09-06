import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MobileConversationActions from '@/renderer/pages/conversation/components/ChatLayout/MobileConversationActions';

vi.mock('@/renderer/pages/conversation/components/ConversationTitleMinimap', () => ({
  default: ({ conversation_id, mobileTitlebar }: { conversation_id?: string; mobileTitlebar?: boolean }) => (
    <button type='button' data-mobile-titlebar={mobileTitlebar}>
      search-{conversation_id}
    </button>
  ),
}));

describe('MobileConversationActions', () => {
  it('portals the conversation search entry and existing actions into the mobile titlebar', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);

    render(
      <MobileConversationActions actionsSlot={slot} conversationId='conversation-1'>
        <button type='button'>extra-action</button>
      </MobileConversationActions>
    );

    expect(screen.getByText('search-conversation-1')).toHaveAttribute('data-mobile-titlebar', 'true');
    expect(screen.getByText('extra-action')).toBeInTheDocument();
  });

  it('keeps other mobile actions available when no conversation is active', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);

    render(
      <MobileConversationActions actionsSlot={slot}>
        <button type='button'>extra-action</button>
      </MobileConversationActions>
    );

    expect(screen.queryByText(/^search-/)).not.toBeInTheDocument();
    expect(screen.getByText('extra-action')).toBeInTheDocument();
  });

  it('renders nothing until the mobile titlebar slot exists', () => {
    render(
      <MobileConversationActions actionsSlot={null} conversationId='conversation-1'>
        <button type='button'>extra-action</button>
      </MobileConversationActions>
    );

    expect(screen.queryByText('search-conversation-1')).not.toBeInTheDocument();
    expect(screen.queryByText('extra-action')).not.toBeInTheDocument();
  });
});
