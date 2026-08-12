import React from 'react';
import { Button, Empty, Spin, Tag } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { AgentSessionSummary } from '@/common/types/agent/cliSessionTypes';
import { formatSessionTimestamp } from './formatters';

type SessionListProps = {
  sessions: AgentSessionSummary[];
  selectedId?: string;
  loading: boolean;
  onSelect: (session: AgentSessionSummary) => void;
};

const SessionList: React.FC<SessionListProps> = ({ sessions, selectedId, loading, onSelect }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className='h-full min-h-180px overflow-y-auto overscroll-contain touch-pan-y flex items-center justify-center'>
        <Spin dot />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className='h-full min-h-180px overflow-y-auto overscroll-contain touch-pan-y flex items-center justify-center px-20px'>
        <Empty description={t('agent.cliSessions.empty')} />
      </div>
    );
  }

  return (
    <div
      data-testid='cli-session-list-scroll'
      className='h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y flex flex-col gap-2px p-6px'
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {sessions.map((session) => (
        <Button
          key={session.id}
          type='text'
          long
          className={`!h-auto !min-h-68px !px-10px !py-8px !text-left ${selectedId === session.id ? '!bg-fill-3' : ''}`}
          onClick={() => onSelect(session)}
        >
          <span className='w-full min-w-0 flex items-center gap-8px'>
            <span className='min-w-0 flex-1 flex flex-col items-start gap-4px'>
              <span className='w-full truncate text-13px font-600 text-t-primary'>{session.title || session.id}</span>
              <span className='w-full truncate font-mono text-11px text-t-tertiary'>{session.id}</span>
              <span className='w-full flex items-center gap-6px overflow-hidden text-11px text-t-secondary'>
                <Tag size='small'>
                  {t(session.parent_id ? 'agent.cliSessions.childSession' : 'agent.cliSessions.mainSession')}
                </Tag>
                {session.model ? <Tag size='small'>{session.model}</Tag> : null}
                <span className='truncate'>{formatSessionTimestamp(session.updated_at)}</span>
              </span>
            </span>
            <Right size='14' className='shrink-0 text-t-tertiary' />
          </span>
        </Button>
      ))}
    </div>
  );
};

export default SessionList;
