/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { CHAT_SURFACE_CONTAINER_CLASS } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
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
import React, { useCallback, useRef, useState } from 'react';
import AcpE2EStreamInjector from './AcpE2EStreamInjector';
import AcpSendBox from './AcpSendBox';
import { useAcpMessage } from './useAcpMessage';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpServerIds?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
}> = ({
  conversation_id,
  workspace,
  backend,
  session_mode,
  agent_name,
  cron_job_id,
  hideSendBox,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpServerIds,
  loadedMcpStatuses,
  teamSendMessage,
  teamRuntime,
  assistantId,
}) => {
  useMessageLstCache(conversation_id);
  usePendingConfirmationsRecovery(conversation_id);
  const teamPermission = useTeamPermission();
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
  const messageState = useAcpMessage(conversation_id, {
    skipWarmup: Boolean(teamPermission),
    prepareRuntime: teamPermission?.warmupSession,
  });

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation_id,
        workspace,
        type: 'acp',
        cron_job_id,
        hideSendBox,
        loadedSkills: activeSkills,
        updateSkills,
        loadedMcpServers,
        loadedMcpServerIds: activeMcpIds,
        updateMcpServers,
        loadedMcpStatuses,
        assistantId,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className={`${CHAT_SURFACE_CONTAINER_CLASS} flex-1 flex flex-col px-20px min-h-0`}>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <AcpE2EStreamInjector conversationId={conversation_id} />
          {!hideSendBox && (
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              session_mode={session_mode}
              agent_name={agent_name}
              workspacePath={workspace}
              messageState={messageState}
              teamSendMessage={teamSendMessage}
              teamRuntime={teamRuntime}
            ></AcpSendBox>
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider, MessagePaginationProvider)(AcpChat);
