import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Message, Radio, Tooltip } from '@arco-design/web-react';
import { Refresh, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type {
  AgentSessionBackend,
  AgentSessionScope,
  AgentSessionSnapshot,
  AgentSessionSummary,
} from '@/common/types/agent/cliSessionTypes';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { useResizableSplit } from '@renderer/hooks/ui/useResizableSplit';
import SettingsPageHeader from '@renderer/pages/settings/components/SettingsPageHeader';
import SessionDetail from './SessionDetail';
import SessionList from './SessionList';

const AgentSessionsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ backend?: string; sessionId?: string }>();
  const isMobile = useLayoutContext()?.isMobile ?? false;
  const backend: AgentSessionBackend =
    params.backend === 'pi' || params.backend === 'opencode' ? params.backend : 'codex';
  const selectedId = params.sessionId;
  const [sessionIdInput, setSessionIdInput] = useState(selectedId || '');
  const [scope, setScope] = useState<AgentSessionScope>('all');
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [snapshot, setSnapshot] = useState<AgentSessionSnapshot>();
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const { splitRatio: listWidth, createDragHandle: createListDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: 300,
    minWidth: 240,
    maxWidth: 520,
    storageKey: 'agent-sessions-list-width-px',
  });

  useEffect(() => {
    setSessionIdInput(selectedId || '');
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    void ipcBridge.agentSessions.list
      .invoke({ backend, scope, limit: 200 })
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch((error) => {
        if (active) {
          setSessions([]);
          console.warn(`[agent-sessions] Failed to list ${backend} sessions; showing an empty list.`, error);
        }
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [backend, refreshToken, scope, t]);

  useEffect(() => {
    let active = true;
    if (!selectedId) {
      setSnapshot(undefined);
      setDetailLoading(false);
      return () => {
        active = false;
      };
    }
    setDetailLoading(true);
    void ipcBridge.agentSessions.inspect
      .invoke({ backend, id: selectedId })
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch((error) => {
        if (active) {
          setSnapshot(undefined);
          Message.error(t('agent.cliSessions.loadFailed', { error: String(error) }));
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [backend, refreshToken, selectedId, t]);

  const openSession = useCallback(
    (session: AgentSessionSummary) => {
      navigate(`/agent-sessions/${session.backend}/${encodeURIComponent(session.id)}`);
    },
    [navigate]
  );

  const handleBackendChange = useCallback(
    (value: string) => {
      const nextBackend = value === 'pi' || value === 'opencode' ? value : 'codex';
      navigate(`/agent-sessions/${nextBackend}`);
    },
    [navigate]
  );

  const handleOpenById = useCallback(() => {
    const id = sessionIdInput.trim();
    if (!id) return;
    navigate(`/agent-sessions/${backend}/${encodeURIComponent(id)}`);
  }, [backend, navigate, sessionIdInput]);

  const content = useMemo(() => {
    const list = (
      <SessionList sessions={sessions} selectedId={selectedId} loading={listLoading} onSelect={openSession} />
    );
    const detail = (
      <SessionDetail
        snapshot={snapshot}
        loading={detailLoading}
        isMobile={isMobile}
        onBack={() => navigate(`/agent-sessions/${backend}`)}
        onOpenSession={openSession}
      />
    );
    if (isMobile) return selectedId ? detail : list;
    return (
      <div
        data-testid='cli-session-split'
        className='h-full min-h-0 grid'
        style={{ gridTemplateColumns: `${listWidth}px minmax(0, 1fr)` }}
      >
        <aside className='relative min-h-0 border-r border-border-2'>
          {list}
          {createListDragHandle({ className: 'cli-session-list-resizer right-[-6px]' })}
        </aside>
        <main className='min-h-0'>{detail}</main>
      </div>
    );
  }, [
    backend,
    createListDragHandle,
    detailLoading,
    isMobile,
    listLoading,
    listWidth,
    navigate,
    openSession,
    selectedId,
    sessions,
    snapshot,
  ]);

  return (
    <div className='h-full min-h-0 w-full bg-1 flex flex-col overflow-hidden'>
      <header className='shrink-0 border-b border-border-2 px-16px py-14px md:px-32px md:py-20px'>
        <div className='mx-auto w-full max-w-1200px'>
          <SettingsPageHeader
            sticky={false}
            title={t('agent.cliSessions.title')}
            description={t('agent.cliSessions.description')}
            actions={
              <Tooltip content={t('common.refresh')}>
                <Button
                  shape='circle'
                  aria-label={t('common.refresh')}
                  icon={<Refresh size='16' />}
                  loading={listLoading || detailLoading}
                  onClick={() => setRefreshToken((value) => value + 1)}
                />
              </Tooltip>
            }
          />
          <div className='mt-14px flex flex-col gap-8px'>
            <div className='flex flex-wrap items-center gap-8px'>
              <Radio.Group type='button' value={backend} onChange={handleBackendChange}>
                <Radio value='codex'>Codex</Radio>
                <Radio value='opencode'>OpenCode</Radio>
                <Radio value='pi'>Pi</Radio>
              </Radio.Group>
              <Radio.Group type='button' value={scope} onChange={(value) => setScope(value as AgentSessionScope)}>
                <Radio value='all'>{t('agent.cliSessions.allSessions')}</Radio>
                <Radio value='main'>{t('agent.cliSessions.mainSessions')}</Radio>
                <Radio value='child'>{t('agent.cliSessions.childSessions')}</Radio>
              </Radio.Group>
            </div>
            <div className='min-w-0 flex flex-1 items-center gap-6px'>
              <Input
                value={sessionIdInput}
                prefix={<Search size='14' />}
                placeholder={t('agent.cliSessions.idPlaceholder')}
                onChange={setSessionIdInput}
                onPressEnter={handleOpenById}
              />
              <Button type='primary' disabled={!sessionIdInput.trim()} onClick={handleOpenById}>
                {t('agent.cliSessions.open')}
              </Button>
            </div>
          </div>
        </div>
      </header>
      <div className='min-h-0 flex-1'>{content}</div>
    </div>
  );
};

export default AgentSessionsPage;
