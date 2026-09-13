/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { CHAT_SURFACE_CONTAINER_CLASS } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import HOC from '@renderer/utils/ui/HOC';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LocalImageView from '@renderer/components/media/LocalImageView';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import AionrsSendBox from './AionrsSendBox';
import type { AionrsModelSelection } from './useAionrsModelSelection';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
  session_mode?: string;
  cron_job_id?: string;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpServerIds?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  agent_name?: string;
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
}> = ({
  conversation_id,
  workspace,
  modelSelection,
  session_mode,
  cron_job_id,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpServerIds,
  loadedMcpStatuses,
  agent_name,
  teamSendMessage,
  teamRuntime,
  assistantId,
}) => {
  useMessageLstCache(conversation_id);
  usePendingConfirmationsRecovery(conversation_id);
  const [activeSkills, setActiveSkills] = useState<string[]>(() => loadedSkills ?? []);
  const activeSkillsRef = useRef(activeSkills);
  const skillUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const initialMcpIds = loadedMcpServerIds ?? loadedMcpStatuses?.map((item) => item.id) ?? [];
  const [activeMcpIds, setActiveMcpIds] = useState<string[]>(() => initialMcpIds);
  const activeMcpIdsRef = useRef(activeMcpIds);
  const mcpUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const updateSkills = useCallback(
    (next: string[] | ((current: string[]) => string[])) => {
      const operation = skillUpdateQueueRef.current.then(async () => {
        const previous = activeSkillsRef.current;
        const requested = typeof next === 'function' ? next(previous) : next;
        const normalized = Array.from(new Set(requested.map((name) => name.trim()).filter(Boolean))).toSorted();
        if (normalized.length === previous.length && normalized.every((name, index) => name === previous[index])) {
          return normalized;
        }
        activeSkillsRef.current = normalized;
        setActiveSkills(normalized);
        try {
          const ok = await ipcBridge.conversation.update.invoke({
            id: conversation_id,
            updates: { extra: { skills: normalized } },
            merge_extra: true,
          });
          if (!ok) throw new Error('Conversation skill update was rejected');
          return normalized;
        } catch (error) {
          activeSkillsRef.current = previous;
          setActiveSkills(previous);
          throw error;
        }
      });
      skillUpdateQueueRef.current = operation.then(
        (): void => undefined,
        (): void => undefined
      );
      return operation;
    },
    [conversation_id]
  );
  const updateMcpServers = useCallback(
    (next: string[] | ((current: string[]) => string[])) => {
      const operation = mcpUpdateQueueRef.current.then(async () => {
        const previous = activeMcpIdsRef.current;
        const requested = typeof next === 'function' ? next(previous) : next;
        const normalized = Array.from(new Set(requested.map((id) => id.trim()).filter(Boolean))).toSorted();
        if (normalized.length === previous.length && normalized.every((id, index) => id === previous[index])) {
          return normalized;
        }
        activeMcpIdsRef.current = normalized;
        setActiveMcpIds(normalized);
        try {
          const ok = await ipcBridge.conversation.update.invoke({
            id: conversation_id,
            updates: { extra: { mcp_server_ids: normalized } },
            merge_extra: true,
          });
          if (!ok) throw new Error('Conversation MCP update was rejected');
          return normalized;
        } catch (error) {
          activeMcpIdsRef.current = previous;
          setActiveMcpIds(previous);
          throw error;
        }
      });
      mcpUpdateQueueRef.current = operation.then(
        (): void => undefined,
        (): void => undefined
      );
      return operation;
    },
    [conversation_id]
  );
  const updateLocalImage = LocalImageView.useUpdateLocalImage();
  useEffect(() => {
    updateLocalImage({ root: workspace });
  }, [workspace]);
  const conversationValue = useMemo<ConversationContextValue>(() => {
    return {
      conversation_id: conversation_id,
      workspace,
      type: 'aionrs',
      cron_job_id,
      loadedSkills: activeSkills,
      updateSkills,
      loadedMcpServers,
      loadedMcpServerIds: activeMcpIds,
      updateMcpServers,
      loadedMcpStatuses,
      assistantId,
    };
  }, [
    conversation_id,
    workspace,
    cron_job_id,
    activeSkills,
    updateSkills,
    loadedMcpServers,
    activeMcpIds,
    updateMcpServers,
    loadedMcpStatuses,
    assistantId,
  ]);

  return (
    <ConversationProvider value={conversationValue}>
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className={`${CHAT_SURFACE_CONTAINER_CLASS} flex-1 flex flex-col px-20px min-h-0`}>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <AionrsSendBox
            conversation_id={conversation_id}
            modelSelection={modelSelection}
            session_mode={session_mode}
            agent_name={agent_name}
            teamSendMessage={teamSendMessage}
            teamRuntime={teamRuntime}
          />
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(
  MessageListProvider,
  MessageListLoadingProvider,
  MessagePaginationProvider,
  LocalImageView.Provider
)(AionrsChat);
