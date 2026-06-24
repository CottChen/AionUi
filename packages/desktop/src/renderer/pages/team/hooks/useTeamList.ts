// src/renderer/pages/team/hooks/useTeamList.ts
import { ipcBridge } from '@/common';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useCallback, useEffect } from 'react';
import useSWR from 'swr';

export function useTeamList() {
  const { user } = useAuth();
  const cacheUserId = user?.id ?? 'local';

  const { data: teams = [], mutate } = useSWR<TTeam[]>(
    `teams/${cacheUserId}`,
    () => ipcBridge.team.list.invoke(),
    { revalidateOnFocus: false }
  );

  // Refresh list when backend creates/removes a team (e.g. via MCP)
  useEffect(() => {
    const unsubListChanged = ipcBridge.team.listChanged.on(() => {
      void mutate();
    });
    const unsubCreated = ipcBridge.team.created.on(() => {
      void mutate();
    });
    const unsubRemoved = ipcBridge.team.removed.on(() => {
      void mutate();
    });
    const unsubRenamed = ipcBridge.team.renamed.on(() => {
      void mutate();
    });
    return () => {
      unsubListChanged();
      unsubCreated();
      unsubRemoved();
      unsubRenamed();
    };
  }, [mutate]);

  const removeTeam = useCallback(
    async (id: string) => {
      await ipcBridge.team.remove.invoke({ id });
      localStorage.removeItem(`team-active-slot-${id}`);
      await mutate();
    },
    [mutate]
  );

  return { teams, mutate, removeTeam };
}
