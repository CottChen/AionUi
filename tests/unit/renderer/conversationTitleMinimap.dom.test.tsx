/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  copyTextMock,
  jumpToItemMock,
  loadQuestionTextMock,
  messageErrorMock,
  messageSuccessMock,
  useMinimapPanelMock,
} = vi.hoisted(() => ({
  copyTextMock: vi.fn(),
  jumpToItemMock: vi.fn(),
  loadQuestionTextMock: vi.fn(),
  messageErrorMock: vi.fn(),
  messageSuccessMock: vi.fn(),
  useMinimapPanelMock: vi.fn(),
}));

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react');
  return {
    Virtuoso: ReactModule.forwardRef<
      unknown,
      { data: unknown[]; itemContent: (index: number, item: unknown) => unknown }
    >(({ data, itemContent }, _ref) => <div>{data.map((item, index) => itemContent(index, item))}</div>),
  };
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      error: messageErrorMock,
      success: messageSuccessMock,
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: copyTextMock,
}));

vi.mock('@/renderer/pages/conversation/components/ConversationTitleMinimap/useMinimapPanel', () => ({
  useMinimapPanel: useMinimapPanelMock,
}));

import ConversationTitleMinimap from '@/renderer/pages/conversation/components/ConversationTitleMinimap';

describe('ConversationTitleMinimap', () => {
  beforeEach(() => {
    copyTextMock.mockReset();
    copyTextMock.mockResolvedValue(undefined);
    jumpToItemMock.mockReset();
    loadQuestionTextMock.mockReset();
    loadQuestionTextMock.mockResolvedValue('complete user question');
    messageErrorMock.mockReset();
    messageSuccessMock.mockReset();
    useMinimapPanelMock.mockReturnValue({
      visible: true,
      loading: false,
      loadingMore: false,
      hasMore: false,
      total: 1,
      items: [
        {
          index: 1,
          question: 'trimmed question',
          answer: 'answer',
          questionRaw: 'complete user question',
          answerRaw: 'complete answer',
          messageId: 'message-1',
          msgId: 'msg-1',
        },
      ],
      searchKeyword: '',
      isSearchMode: true,
      activeResultIndex: -1,
      panelWidth: 420,
      panelPos: { left: 12, top: 60 },
      visualStyle: {
        background: 'white',
        border: '1px solid black',
        borderColor: 'black',
        borderRadius: '8px',
        boxShadow: 'none',
      },
      triggerRef: React.createRef(),
      panelRef: React.createRef(),
      searchInputRef: React.createRef(),
      normalizedKeyword: '',
      filteredItems: [
        {
          index: 1,
          question: 'trimmed question',
          answer: 'answer',
          questionRaw: 'complete user question',
          answerRaw: 'complete answer',
          messageId: 'message-1',
          msgId: 'msg-1',
        },
      ],
      panelHeight: 200,
      setSearchKeyword: vi.fn(),
      setActiveResultIndex: vi.fn(),
      loadMore: vi.fn(),
      loadQuestionText: loadQuestionTextMock,
      togglePanel: vi.fn(),
      openSearchPanel: vi.fn(),
      jumpToItem: jumpToItemMock,
      handleSearchInputBlur: vi.fn(),
      handleSearchInputCompositionStart: vi.fn(),
      handleSearchInputCompositionEnd: vi.fn(),
    });
  });

  it('copies the complete user input without navigating away from the result list', async () => {
    render(<ConversationTitleMinimap conversation_id='conversation-1' hideTrigger />);

    fireEvent.click(screen.getByRole('button', { name: 'common.copy' }));

    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith('complete user question');
    });
    expect(loadQuestionTextMock).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'message-1' }));
    expect(jumpToItemMock).not.toHaveBeenCalled();
  });
});
