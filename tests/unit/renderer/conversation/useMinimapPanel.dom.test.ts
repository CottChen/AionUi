import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { useMinimapPanel } from '@/renderer/pages/conversation/components/ConversationTitleMinimap/useMinimapPanel';

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationTurnPreviews: { invoke: vi.fn() },
      getConversationMessages: { invoke: vi.fn() },
    },
  },
}));

const previewInvoke = vi.mocked(ipcBridge.database.getConversationTurnPreviews.invoke);
const messagesInvoke = vi.mocked(ipcBridge.database.getConversationMessages.invoke);

describe('useMinimapPanel', () => {
  beforeEach(() => {
    previewInvoke.mockReset();
    messagesInvoke.mockReset();
  });

  it('loads one lightweight turn-preview response instead of walking message pages', async () => {
    previewInvoke.mockResolvedValue([
      {
        index: 1,
        question: 'Question text',
        answer: 'Answer text',
        messageId: 'message-1',
        msgId: 'client-1',
      },
    ]);
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));

    act(() => result.current.openSearchPanel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].questionRaw).toBe('Question text');
    expect(previewInvoke).toHaveBeenCalledTimes(1);
    expect(messagesInvoke).not.toHaveBeenCalled();
  });

  it('keeps cached results visible while a reopen refresh is pending', async () => {
    previewInvoke.mockResolvedValueOnce([
      { index: 1, question: 'Cached question', answer: '', messageId: 'message-1' },
    ]);
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));
    act(() => result.current.openSearchPanel());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let finishRefresh: ((value: []) => void) | undefined;
    previewInvoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        })
    );
    act(() => result.current.openSearchPanel());

    expect(result.current.loading).toBe(false);
    expect(result.current.items[0].questionRaw).toBe('Cached question');

    await act(async () => finishRefresh?.([]));
  });

  it('deduplicates concurrent preview requests', async () => {
    let finishRequest: ((value: []) => void) | undefined;
    previewInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        })
    );
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));

    act(() => {
      result.current.openSearchPanel();
      result.current.openSearchPanel();
    });

    expect(previewInvoke).toHaveBeenCalledTimes(1);
    await act(async () => finishRequest?.([]));
  });

  it('falls back to compact pagination with an older backend', async () => {
    previewInvoke.mockRejectedValue({ name: 'BackendHttpError', status: 404, code: '' });
    messagesInvoke.mockResolvedValue({
      items: [
        {
          id: 'message-1',
          conversation_id: 'conversation-1',
          msg_id: 'client-1',
          type: 'text',
          content: { content: 'Fallback question' },
          position: 'right',
          status: 'finish',
          hidden: false,
          created_at: 1,
        },
      ],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));

    act(() => result.current.openSearchPanel());

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(messagesInvoke).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      limit: 200,
      content_mode: 'compact',
    });
  });

  it('ignores an old response after switching away and back to a conversation', async () => {
    let finishOldRequest: ((value: []) => void) | undefined;
    previewInvoke
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldRequest = resolve;
          })
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ index: 1, question: 'Fresh question', answer: '', messageId: 'fresh-message' }]);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useMinimapPanel(id), {
      initialProps: { id: 'conversation-1' },
    });

    act(() => result.current.openSearchPanel());
    rerender({ id: 'conversation-2' });
    act(() => result.current.openSearchPanel());
    await waitFor(() => expect(previewInvoke).toHaveBeenCalledTimes(2));

    rerender({ id: 'conversation-1' });
    act(() => result.current.openSearchPanel());
    await waitFor(() => expect(result.current.items[0]?.questionRaw).toBe('Fresh question'));

    await act(async () => finishOldRequest?.([]));
    expect(result.current.items[0]?.questionRaw).toBe('Fresh question');
  });
});
