/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadAllConversationMessagesPaged = vi.fn();
const railMocks = vi.hoisted(() => ({
  isMobile: true,
  messages: [] as TMessage[],
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadAllConversationMessagesPaged: (...args: unknown[]) => loadAllConversationMessagesPaged(...args),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => railMocks.messages,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'c1' }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: railMocks.isMobile }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { useConversationAnchors } =
  await import('@/renderer/pages/conversation/Messages/anchorRail/useConversationAnchors');
const { default: MessageAnchorRail } =
  await import('@/renderer/pages/conversation/Messages/anchorRail/MessageAnchorRail');
const { CHAT_SEARCH_PANEL_OPEN_EVENT } = await import('@/renderer/utils/chat/chatMinimapEvents');

/** Builds one user/assistant turn pair. */
const turn = (n: number): TMessage[] =>
  [
    {
      id: `u-${n}`,
      msg_id: `u-${n}`,
      conversation_id: 'c1',
      type: 'text',
      position: 'right',
      created_at: n * 2,
      content: { content: `question ${n}` },
    },
    {
      id: `a-${n}`,
      msg_id: `a-${n}`,
      conversation_id: 'c1',
      type: 'text',
      position: 'left',
      created_at: n * 2 + 1,
      content: { content: `answer ${n}` },
    },
  ] as unknown as TMessage[];

const history = (count: number) => Array.from({ length: count }, (_, i) => turn(i + 1)).flat();

describe('useConversationAnchors', () => {
  beforeEach(() => {
    loadAllConversationMessagesPaged.mockReset();
    railMocks.isMobile = true;
    railMocks.messages = [];
  });

  it('uses the already-loaded chat page until complete history is requested', () => {
    loadAllConversationMessagesPaged.mockResolvedValue(history(40));
    const paged = history(40).slice(-4); // chat area holds the last 2 turns

    const { result } = renderHook(() => useConversationAnchors('c1', paged, false));

    expect(result.current).toHaveLength(2);
    expect(result.current[0]?.question).toContain('question 39');
    expect(loadAllConversationMessagesPaged).not.toHaveBeenCalled();
  });

  it('reads compact previews only after complete history is requested', async () => {
    loadAllConversationMessagesPaged.mockResolvedValue(history(3));
    renderHook(() => useConversationAnchors('c1', [], true));

    await waitFor(() => expect(loadAllConversationMessagesPaged).toHaveBeenCalled());
    expect(loadAllConversationMessagesPaged).toHaveBeenCalledWith('c1', { contentMode: 'compact' });
  });

  it('lets newly sent messages extend the rail without re-reading history', async () => {
    loadAllConversationMessagesPaged.mockResolvedValue(history(5));
    const { result, rerender } = renderHook(
      ({ live, loadFullHistory }) => useConversationAnchors('c1', live, loadFullHistory),
      {
        initialProps: { live: history(5), loadFullHistory: true },
      }
    );

    await waitFor(() => expect(result.current).toHaveLength(5));

    // A new turn arrives in memory; the rail must grow immediately.
    rerender({ live: history(6), loadFullHistory: true });
    await waitFor(() => expect(result.current).toHaveLength(6));
    expect(loadAllConversationMessagesPaged).toHaveBeenCalledTimes(1);
  });

  it('drops the previous conversation ticks when switching', async () => {
    loadAllConversationMessagesPaged.mockImplementation((id: string) =>
      Promise.resolve(id === 'c1' ? history(30) : history(2))
    );

    const { result, rerender } = renderHook(({ id }) => useConversationAnchors(id, [], true), {
      initialProps: { id: 'c1' },
    });
    await waitFor(() => expect(result.current).toHaveLength(30));

    rerender({ id: 'c2' });
    // Must not keep showing c1's 30 ticks while c2 is open.
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('ignores a slow response that lands after the conversation changed', async () => {
    let resolveFirst: ((messages: TMessage[]) => void) | undefined;
    loadAllConversationMessagesPaged.mockImplementation((id: string) => {
      if (id === 'c1') return new Promise<TMessage[]>((resolve) => (resolveFirst = resolve));
      return Promise.resolve(history(3));
    });

    const { result, rerender } = renderHook(({ id }) => useConversationAnchors(id, [], true), {
      initialProps: { id: 'c1' },
    });
    rerender({ id: 'c2' });
    await waitFor(() => expect(result.current).toHaveLength(3));

    // c1's request finally resolves — it must not overwrite c2's ticks.
    await act(async () => {
      resolveFirst?.(history(30));
    });
    expect(result.current).toHaveLength(3);
  });

  it('falls back to the in-memory list when the history read fails', async () => {
    loadAllConversationMessagesPaged.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useConversationAnchors('c1', history(2), true));

    // Degrades to whatever the chat area has, rather than rendering nothing.
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('renders no ticks without a conversation', () => {
    const { result } = renderHook(() => useConversationAnchors(undefined, [], false));
    expect(result.current).toEqual([]);
    expect(loadAllConversationMessagesPaged).not.toHaveBeenCalled();
  });
});

describe('MessageAnchorRail on mobile', () => {
  beforeEach(() => {
    loadAllConversationMessagesPaged.mockResolvedValue([]);
    railMocks.isMobile = true;
    railMocks.messages = history(3);
  });

  it('renders only the search entry even when the conversation has multiple turns', () => {
    render(<MessageAnchorRail />);

    expect(screen.getByTestId('message-anchor-rail')).toHaveAttribute('data-mobile-search-only', 'true');
    expect(screen.getByTestId('message-anchor-rail-search')).toBeVisible();
    expect(screen.queryAllByTestId('message-anchor-tick')).toHaveLength(0);
    expect(screen.queryByTestId('message-anchor-preview')).not.toBeInTheDocument();
    expect(loadAllConversationMessagesPaged).not.toHaveBeenCalled();
  });

  it('opens the searchable prompt list for the current conversation', () => {
    const handler = vi.fn();
    window.addEventListener(CHAT_SEARCH_PANEL_OPEN_EVENT, handler);
    render(<MessageAnchorRail />);

    fireEvent.click(screen.getByTestId('message-anchor-rail-search'));
    window.removeEventListener(CHAT_SEARCH_PANEL_OPEN_EVENT, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ conversation_id: 'c1' });
  });
});

describe('MessageAnchorRail on desktop', () => {
  beforeEach(() => {
    loadAllConversationMessagesPaged.mockResolvedValue(history(5));
    railMocks.isMobile = false;
    railMocks.messages = history(3);
  });

  it('defers the full-history request until the user enters the navigation rail', async () => {
    render(<MessageAnchorRail />);

    const railZone = screen.getByTestId('message-anchor-rail-zone');
    expect(loadAllConversationMessagesPaged).not.toHaveBeenCalled();

    fireEvent.pointerEnter(railZone);

    await waitFor(() => {
      expect(loadAllConversationMessagesPaged).toHaveBeenCalledWith('c1', { contentMode: 'compact' });
    });
  });
});
