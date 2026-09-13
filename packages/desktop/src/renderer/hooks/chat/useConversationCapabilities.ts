/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILTIN_IMAGE_GEN_ID, BUILTIN_IMAGE_GEN_NAME, type IMcpServer } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConversationCapabilitySkill = {
  name: string;
  description: string;
  is_auto_inject?: boolean;
};

type UseConversationCapabilitiesOptions = {
  conversationId: string;
  enabled: boolean;
  loadedSkills?: string[];
  loadedMcpServerIds?: string[];
  loadedMcpServerNames?: string[];
};

type UseConversationCapabilitiesResult = {
  availableSkills: ConversationCapabilitySkill[];
  availableMcpServers: IMcpServer[];
  selectedSkills: string[];
  selectedMcpServerIds: string[];
  isLoading: boolean;
  isUpdating: boolean;
  addSkill: (name: string) => Promise<void>;
  addMcpServer: (id: string) => Promise<void>;
};

const uniqueNames = (values: string[] | undefined): string[] => {
  const result: string[] = [];
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized && !result.includes(normalized)) result.push(normalized);
  }
  return result;
};

const isHiddenBuiltinMcp = (server: IMcpServer): boolean => {
  // Built-in MCPs are managed by AionUi rather than selected per conversation.
  // Keep the explicit image-gen identifiers in the predicate so older records
  // that lost the builtin flag are still hidden as well.
  return server.builtin === true || server.id === BUILTIN_IMAGE_GEN_ID || server.name === BUILTIN_IMAGE_GEN_NAME;
};

/**
 * Loads capability catalogs for the conversation picker on both WebUI/Desktop
 * and mobile, and serializes updates so rapid taps cannot overwrite one another.
 * The backend owns the actual snapshot update and rebuilds the agent task.
 */
export const useConversationCapabilities = ({
  conversationId,
  enabled,
  loadedSkills,
  loadedMcpServerIds,
  loadedMcpServerNames,
}: UseConversationCapabilitiesOptions): UseConversationCapabilitiesResult => {
  const [availableSkills, setAvailableSkills] = useState<ConversationCapabilitySkill[]>([]);
  const [availableMcpServers, setAvailableMcpServers] = useState<IMcpServer[]>([]);
  const [selectedSkills, setSelectedSkills] = useState(() => uniqueNames(loadedSkills));
  const [selectedMcpServerIds, setSelectedMcpServerIds] = useState(() => uniqueNames(loadedMcpServerIds));
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const selectedSkillsRef = useRef(selectedSkills);
  const selectedMcpIdsRef = useRef(selectedMcpServerIds);
  const updateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadedSkillsKey = uniqueNames(loadedSkills).join('\u0000');
  const loadedMcpIdsKey = uniqueNames(loadedMcpServerIds).join('\u0000');
  const loadedMcpNamesKey = uniqueNames(loadedMcpServerNames).join('\u0000');

  useEffect(() => {
    const nextSkills = loadedSkillsKey ? loadedSkillsKey.split('\u0000') : [];
    const nextMcpIds = loadedMcpIdsKey ? loadedMcpIdsKey.split('\u0000') : [];
    selectedSkillsRef.current = nextSkills;
    selectedMcpIdsRef.current = nextMcpIds;
    setSelectedSkills(nextSkills);
    setSelectedMcpServerIds(nextMcpIds);
  }, [loadedMcpIdsKey, loadedSkillsKey]);

  useEffect(() => {
    if (!enabled || !conversationId) return;
    let cancelled = false;
    setIsLoading(true);
    let catalogPromise: Promise<
      [
        PromiseSettledResult<Awaited<ReturnType<typeof ipcBridge.fs.listAvailableSkills.invoke>>>,
        PromiseSettledResult<Awaited<ReturnType<typeof ensureBackendMcpCatalog>>>,
      ]
    >;
    try {
      catalogPromise = Promise.allSettled([
        ipcBridge.fs.listAvailableSkills.invoke(),
        // Keep parity with Tools settings: WebUI MCPs can come from the
        // backend catalog as well as the client-side mcp.config overlay.
        ensureBackendMcpCatalog(),
      ]);
    } catch {
      setAvailableSkills([]);
      setAvailableMcpServers([]);
      setIsLoading(false);
      return;
    }
    catalogPromise
      .then(([skillsResult, mcpResult]) => {
        if (cancelled) return;
        const skills = skillsResult.status === 'fulfilled' ? skillsResult.value : [];
        const servers = mcpResult.status === 'fulfilled' ? mcpResult.value.allServers : [];
        const legacyNames = loadedMcpNamesKey ? loadedMcpNamesKey.split('\u0000') : [];
        if (legacyNames.length > 0) {
          const resolvedIds = uniqueNames([
            ...selectedMcpIdsRef.current.map(
              (id) => servers.find((server) => server.id === id || server.name === id)?.id ?? id
            ),
            ...legacyNames.map((name) => servers.find((server) => server.name === name)?.id ?? name),
          ]);
          selectedMcpIdsRef.current = resolvedIds;
          setSelectedMcpServerIds(resolvedIds);
        }
        setAvailableSkills(
          skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            is_auto_inject: skill.is_auto_inject,
          }))
        );
        const seen = new Set<string>();
        const mergedServers = servers;
        setAvailableMcpServers(
          mergedServers.filter((server) => {
            if (isHiddenBuiltinMcp(server)) return false;
            const key = server.id || server.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableSkills([]);
          setAvailableMcpServers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled, loadedMcpNamesKey]);

  const enqueueUpdate = useCallback(
    (addition: { skill?: string; mcpServerId?: string }) => {
      const nextSkills = addition.skill
        ? uniqueNames([...selectedSkillsRef.current, addition.skill])
        : selectedSkillsRef.current;
      const nextMcpServerIds = addition.mcpServerId
        ? uniqueNames([...selectedMcpIdsRef.current, addition.mcpServerId])
        : selectedMcpIdsRef.current;
      selectedSkillsRef.current = nextSkills;
      selectedMcpIdsRef.current = nextMcpServerIds;
      setSelectedSkills(nextSkills);
      setSelectedMcpServerIds(nextMcpServerIds);
      setIsUpdating(true);

      const request = updateQueueRef.current
        .catch((): undefined => undefined)
        .then(() =>
          ipcBridge.conversation.updateCapabilities.invoke({
            id: conversationId,
            skills_to_add: addition.skill ? [addition.skill] : [],
            mcp_server_ids_to_add: addition.mcpServerId ? [addition.mcpServerId] : [],
          })
        )
        .then((): undefined => undefined)
        .catch((error: unknown) => {
          // Roll back only the failed addition. A later queued tap may have
          // succeeded and must remain selected.
          if (addition.skill) {
            const rolledBackSkills = selectedSkillsRef.current.filter((name) => name !== addition.skill);
            selectedSkillsRef.current = rolledBackSkills;
            setSelectedSkills(rolledBackSkills);
          }
          if (addition.mcpServerId) {
            const rolledBackMcpIds = selectedMcpIdsRef.current.filter((id) => id !== addition.mcpServerId);
            selectedMcpIdsRef.current = rolledBackMcpIds;
            setSelectedMcpServerIds(rolledBackMcpIds);
          }
          throw error;
        })
        .finally((): void => setIsUpdating(false));
      updateQueueRef.current = request;
      return request;
    },
    [conversationId]
  );

  const addSkill = useCallback(
    async (name: string) => {
      if (selectedSkillsRef.current.includes(name)) return;
      await enqueueUpdate({ skill: name });
    },
    [enqueueUpdate]
  );

  const addMcpServer = useCallback(
    async (id: string) => {
      if (selectedMcpIdsRef.current.includes(id)) return;
      await enqueueUpdate({ mcpServerId: id });
    },
    [enqueueUpdate]
  );

  return {
    availableSkills,
    availableMcpServers,
    selectedSkills,
    selectedMcpServerIds,
    isLoading,
    isUpdating,
    addSkill,
    addMcpServer,
  };
};
