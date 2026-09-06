import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { IMessageSearchItem } from '@/common/types/team/database';
import ConversationSearchPopover from '@/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';

const { copyText } = vi.hoisted(() => ({
  copyText: vi.fn<(_: string) => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      searchConversationMessages: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children, visible }: { children?: React.ReactNode; visible: boolean }) =>
    visible ? <div>{children}</div> : null,
}));

vi.mock('@/renderer/components/base', () => ({
  AionSearchInput: ({
    onChange,
    placeholder,
    value,
  }: {
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  }) => (
    <input
      aria-label='conversation-search-input'
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: undefined }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'assistant_fallback' }),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({ copyText }));

vi.mock('@arco-design/web-react', () => ({
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Message: { success: vi.fn(), error: vi.fn() },
  Spin: () => <div>loading</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Typography: {
    Paragraph: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  },
}));

vi.mock('@icon-park/react', () => ({
  Close: () => <span />,
  Copy: () => <span />,
  MessageOne: () => <span />,
  Robot: () => <span />,
  Search: () => <span />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const searchInvoke = vi.mocked(ipcBridge.database.searchConversationMessages.invoke);

const makeItem = (messageId: string, previewText: string): IMessageSearchItem => ({
  message_id: messageId,
  message_type: 'text',
  message_created_at: 1,
  preview_text: previewText,
  conversation: {
    id: 'conversation-1',
    name: 'Conversation',
    type: 'acp',
    extra: { backend: 'claude' },
    created_at: 1,
    modified_at: 1,
  },
});

const openAndSearch = async (keyword: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'open-search' }));
  fireEvent.change(screen.getByLabelText('conversation-search-input'), { target: { value: keyword } });
  await waitFor(() => expect(searchInvoke).toHaveBeenCalled());
};

describe('ConversationSearchPopover', () => {
  beforeEach(() => {
    searchInvoke.mockReset();
    localStorage.clear();
  });

  it('starts backend pagination at page one', async () => {
    searchInvoke.mockResolvedValue({ items: [], total: 0, has_more: false });
    render(
      <ConversationSearchPopover
        renderTrigger={({ onClick }) => (
          <button type='button' aria-label='open-search' onClick={onClick}>
            open
          </button>
        )}
      />
    );

    await openAndSearch('search');

    expect(searchInvoke).toHaveBeenCalledWith({ keyword: 'search', page: 1, page_size: 20 });
  });

  it('keeps the newest keyword results when an older request finishes later', async () => {
    let resolveFirst: ((value: { items: IMessageSearchItem[]; total: number; has_more: boolean }) => void) | undefined;
    searchInvoke
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ items: [makeItem('new', 'new result')], total: 1, has_more: false });
    render(
      <ConversationSearchPopover
        renderTrigger={({ onClick }) => (
          <button type='button' aria-label='open-search' onClick={onClick}>
            open
          </button>
        )}
      />
    );

    await openAndSearch('first');
    fireEvent.change(screen.getByLabelText('conversation-search-input'), { target: { value: 'second' } });
    await waitFor(() => expect(searchInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('new result')).toBeInTheDocument());

    resolveFirst?.({ items: [makeItem('old', 'old result')], total: 1, has_more: false });

    await waitFor(() => expect(screen.queryByText('old result')).not.toBeInTheDocument());
    expect(screen.getByText('new result')).toBeInTheDocument();
  });

  it('copies the matched user input without opening the conversation', async () => {
    searchInvoke.mockResolvedValue({ items: [makeItem('message-1', '用户输入内容')], total: 1, has_more: false });
    render(
      <ConversationSearchPopover
        renderTrigger={({ onClick }) => (
          <button type='button' aria-label='open-search' onClick={onClick}>
            open
          </button>
        )}
      />
    );

    await openAndSearch('输入');
    const copyButton = screen.getByRole('button', { name: 'common.copy' });
    fireEvent.click(copyButton);

    await waitFor(() => expect(copyText).toHaveBeenCalledWith('用户输入内容'));
  });
});
