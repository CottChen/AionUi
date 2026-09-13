/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Whitelist of message types that indicate content generation is in progress.
 * Only these types should trigger the sidebar loading spinner.
 * Using a whitelist (instead of a blacklist) prevents unknown/internal message
 * types (e.g. slash_commands_updated, acp_context_usage) from falsely
 * triggering the generating state.
 */
const isGeneratingStreamMessage = (type: string): boolean => {
  return (
    type === 'content' ||
    type === 'start' ||
    type === 'thought' ||
    type === 'thinking' ||
    type === 'tool_group' ||
    type === 'acp_tool_call' ||
    type === 'acp_permission' ||
    type === 'permission' ||
    type === 'plan'
  );
};

const isTerminalAgentStatus = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { status } = data as { status?: string };
  return status === 'error' || status === 'disconnected';
};

const isTerminalStreamMessage = (message: { type: string; data: unknown }): boolean => {
  return (
    message.type === 'finish' ||
    message.type === 'error' ||
    (message.type === 'agent_status' && isTerminalAgentStatus(message.data))
  );
};

const isTerminalTurnState = (state: string): boolean => {
  return state === 'ai_waiting_input' || state === 'error' || state === 'stopped';
};

export type SidebarStreamGuardDecision = {
  markGenerating: boolean;
  clearCompleted: boolean;
  lateIgnored: boolean;
};

export const getSidebarStreamGuardDecision = ({
  type,
  completed,
}: {
  type: string;
  completed: boolean;
}): SidebarStreamGuardDecision => {
  if (!isGeneratingStreamMessage(type)) {
    return {
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    };
  }

  if (type === 'start') {
    return {
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    };
  }

  if (completed) {
    return {
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    };
  }

  return {
    markGenerating: true,
    clearCompleted: false,
    lateIgnored: false,
  };
};

type ConversationListSyncSnapshot = {
  conversations: TChatConversation[];
  generatingConversationIds: Set<string>;
  completionUnreadConversationIds: Set<string>;
  hasMoreConversations: boolean;
  loadingConversations: boolean;
};

const listeners = new Set<() => void>();
const CONVERSATION_PAGE_SIZE = 100;
let refreshSequence = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let conversationCursorState: string | undefined;
let hasMoreConversationsState = false;
let loadingConversationsState = false;

let isStoreInitialized = false;
let conversationsState: TChatConversation[] = [];
let generatingConversationIdsState = new Set<string>();
let completionUnreadConversationIdsState = new Set<string>();
let completedConversationIdsState = new Set<string>();
let conversation_idsState = new Set<string>();
let activeConversationIdState: string | null = null;
let snapshotState: ConversationListSyncSnapshot = {
  conversations: conversationsState,
  generatingConversationIds: generatingConversationIdsState,
  completionUnreadConversationIds: completionUnreadConversationIdsState,
  hasMoreConversations: hasMoreConversationsState,
  loadingConversations: loadingConversationsState,
};

const emitStoreChange = () => {
  snapshotState = {
    conversations: conversationsState,
    generatingConversationIds: generatingConversationIdsState,
    completionUnreadConversationIds: completionUnreadConversationIdsState,
    hasMoreConversations: hasMoreConversationsState,
    loadingConversations: loadingConversationsState,
  };
  listeners.forEach((listener) => listener());
};

const subscribeConversationListSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getConversationListSyncSnapshot = (): ConversationListSyncSnapshot => snapshotState;

const loadConversationPage = async (sequence: number, cursor: string | undefined, replace: boolean) => {
  if (loadingConversationsState || sequence !== refreshSequence) return;
  loadingConversationsState = true;
  emitStoreChange();

  try {
    const result = await ipcBridge.database.getUserConversations.invoke({
      cursor,
      limit: CONVERSATION_PAGE_SIZE,
    });
    if (sequence !== refreshSequence) return;

    const items = result?.items;
    if (!items || !Array.isArray(items)) {
      hasMoreConversationsState = false;
      conversationCursorState = undefined;
      return;
    }

    const filteredData = items.filter((conv) => {
      // Legacy rows from the pre-provider-probe health check flow are hidden
      // from normal history. New health checks must not create conversations.
      const extra = conv.extra as { is_health_check?: boolean; team_id?: string; teamId?: string } | undefined;
      return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId;
    });
    conversationsState = replace ? filteredData : [...conversationsState, ...filteredData];
    // Use ALL conversation IDs (including team/legacy health-check rows) so the
    // responseStream listener recognises them as known and avoids a refresh loop.
    conversation_idsState = new Set([...conversation_idsState, ...items.map((conversation) => conversation.id)]);
    hasMoreConversationsState = result.has_more === true && items.length > 0;
    conversationCursorState = hasMoreConversationsState ? items[items.length - 1]?.id : undefined;
    emitStoreChange();
  } catch (error) {
    if (sequence !== refreshSequence) return;
    console.error('[WorkspaceGroupedHistory] Failed to load conversations:', error);
    if (replace) {
      conversationsState = [];
      conversation_idsState = new Set();
    }
    hasMoreConversationsState = false;
    conversationCursorState = undefined;
  } finally {
    if (sequence === refreshSequence) {
      loadingConversationsState = false;
      emitStoreChange();
    }
  }
};

const refreshConversations = () => {
  const sequence = ++refreshSequence;
  loadingConversationsState = false;
  conversationCursorState = undefined;
  hasMoreConversationsState = false;
  conversation_idsState = new Set();
  void loadConversationPage(sequence, undefined, true);
};

const loadMoreConversations = () => {
  if (!hasMoreConversationsState || loadingConversationsState || !conversationCursorState) return;
  void loadConversationPage(refreshSequence, conversationCursorState, false);
};

const scheduleRefreshConversations = () => {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshConversations();
  }, 100);
};

const markGenerating = (conversation_id: string) => {
  if (generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  generatingConversationIdsState = new Set(generatingConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearGenerating = (conversation_id: string) => {
  if (!generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(generatingConversationIdsState);
  next.delete(conversation_id);
  generatingConversationIdsState = next;
  emitStoreChange();
};

const markCompletionUnread = (conversation_id: string) => {
  if (completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  completionUnreadConversationIdsState = new Set(completionUnreadConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearCompletionUnreadState = (conversation_id: string) => {
  if (!completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completionUnreadConversationIdsState);
  next.delete(conversation_id);
  completionUnreadConversationIdsState = next;
  emitStoreChange();
};

const markCompleted = (conversation_id: string) => {
  completedConversationIdsState = new Set(completedConversationIdsState).add(conversation_id);
};

const clearCompleted = (conversation_id: string) => {
  if (!completedConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completedConversationIdsState);
  next.delete(conversation_id);
  completedConversationIdsState = next;
};

const logLateStreamIgnored = (conversation_id: string, type: string) => {
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'warn',
      tag: 'conversationRuntimeView',
      message: 'late_stream_ignored_for_runtime',
      data: {
        conversation_id,
        stream_type: type,
      },
    })
    .catch(() => {});
};

const setActiveConversationState = (conversation_id: string | null) => {
  activeConversationIdState = conversation_id;
};

const initializeConversationListSyncStore = () => {
  if (isStoreInitialized) {
    return;
  }

  isStoreInitialized = true;
  refreshConversations();

  addEventListener('chat.history.refresh', scheduleRefreshConversations);
  ipcBridge.conversation.listChanged.on((event) => {
    if (event.action === 'deleted') {
      clearGenerating(event.conversation_id);
      clearCompletionUnreadState(event.conversation_id);
      clearCompleted(event.conversation_id);
    }
    scheduleRefreshConversations();
  });
  ipcBridge.conversation.responseStream.on((message) => {
    const conversation_id = message.conversation_id;
    if (!conversation_id) {
      return;
    }

    if (!conversation_idsState.has(conversation_id)) {
      scheduleRefreshConversations();
    }

    if (isTerminalStreamMessage(message)) {
      const wasGenerating = generatingConversationIdsState.has(conversation_id);
      if (wasGenerating && activeConversationIdState !== conversation_id) {
        markCompletionUnread(conversation_id);
      }
      clearGenerating(conversation_id);
      return;
    }

    const decision = getSidebarStreamGuardDecision({
      type: message.type,
      completed: completedConversationIdsState.has(conversation_id),
    });
    if (decision.clearCompleted) {
      clearCompleted(conversation_id);
    }
    if (decision.lateIgnored) {
      logLateStreamIgnored(conversation_id, message.type);
      return;
    }
    if (decision.markGenerating) {
      markGenerating(conversation_id);
    }
  });
  ipcBridge.conversation.turnCompleted.on((event) => {
    if (isTerminalTurnState(event.state) && activeConversationIdState !== event.session_id) {
      markCompletionUnread(event.session_id);
    }
    markCompleted(event.session_id);
    clearGenerating(event.session_id);
    scheduleRefreshConversations();
  });
};

export const useConversationListSync = () => {
  useEffect(() => {
    initializeConversationListSyncStore();
  }, []);

  const {
    conversations,
    generatingConversationIds,
    completionUnreadConversationIds,
    hasMoreConversations,
    loadingConversations,
  } = useSyncExternalStore(
    subscribeConversationListSync,
    getConversationListSyncSnapshot,
    getConversationListSyncSnapshot
  );

  const clearCompletionUnread = useCallback((conversation_id: string) => {
    clearCompletionUnreadState(conversation_id);
  }, []);

  const setActiveConversation = useCallback((conversation_id: string | null) => {
    setActiveConversationState(conversation_id);
  }, []);

  const isConversationGenerating = useCallback(
    (conversation_id: string) => {
      return generatingConversationIds.has(conversation_id);
    },
    [generatingConversationIds]
  );

  const hasCompletionUnread = useCallback(
    (conversation_id: string) => {
      return completionUnreadConversationIds.has(conversation_id);
    },
    [completionUnreadConversationIds]
  );

  return {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    hasMoreConversations,
    loadingConversations,
    loadMoreConversations,
    clearCompletionUnread,
    setActiveConversation,
  };
};
