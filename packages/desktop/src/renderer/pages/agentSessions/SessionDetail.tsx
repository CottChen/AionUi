import React, { useEffect, useMemo, useState } from 'react';
import { Button, Collapse, Empty, Message, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { ArrowLeft, Copy, Right } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { AgentSessionItem, AgentSessionSnapshot, AgentSessionSummary } from '@/common/types/agent/cliSessionTypes';
import { formatSessionTimestamp, formatStructuredValue } from './formatters';

type SessionDetailProps = {
  snapshot?: AgentSessionSnapshot;
  loading: boolean;
  isMobile: boolean;
  onBack: () => void;
  onOpenSession: (session: AgentSessionSummary) => void;
};

const VISIBLE_ITEM_PAGE_SIZE = 250;

const BACKEND_LABELS: Record<AgentSessionSummary['backend'], string> = {
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
};

const ITEM_LABELS: Record<AgentSessionItem['kind'], string> = {
  user_message: 'agent.cliSessions.userMessage',
  agent_message: 'agent.cliSessions.agentMessage',
  thinking: 'agent.cliSessions.thinking',
  tool_call: 'agent.cliSessions.toolCall',
};

const copyText = async (value: string, successMessage: string) => {
  await navigator.clipboard.writeText(value);
  Message.success(successMessage);
};

const ToolCall: React.FC<{ item: AgentSessionItem }> = ({ item }) => {
  const { t } = useTranslation();
  return (
    <Collapse bordered={false} className='bg-fill-1 rd-6px'>
      <Collapse.Item
        name={item.id || item.name || 'tool'}
        header={
          <span className='min-w-0 flex items-center gap-8px'>
            <span className='truncate font-mono text-12px text-t-primary'>
              {item.name || t('agent.cliSessions.toolCall')}
            </span>
            {item.status ? <Tag size='small'>{item.status}</Tag> : null}
            {item.truncated ? (
              <Tag size='small' color='orange'>
                {t('agent.cliSessions.truncated')}
              </Tag>
            ) : null}
          </span>
        }
      >
        <div className='flex flex-col gap-12px'>
          {item.input !== undefined ? (
            <div>
              <div className='mb-5px text-11px font-600 text-t-secondary'>{t('agent.cliSessions.toolInput')}</div>
              <pre className='m-0 max-h-320px overflow-auto whitespace-pre-wrap break-words rd-4px bg-2 p-10px font-mono text-11px leading-18px text-t-primary'>
                {formatStructuredValue(item.input)}
              </pre>
            </div>
          ) : null}
          {item.output !== undefined ? (
            <div>
              <div className='mb-5px text-11px font-600 text-t-secondary'>{t('agent.cliSessions.toolOutput')}</div>
              <pre className='m-0 max-h-420px overflow-auto whitespace-pre-wrap break-words rd-4px bg-2 p-10px font-mono text-11px leading-18px text-t-primary'>
                {formatStructuredValue(item.output)}
              </pre>
            </div>
          ) : null}
        </div>
      </Collapse.Item>
    </Collapse>
  );
};

const TimelineItem: React.FC<{ item: AgentSessionItem }> = ({ item }) => {
  const { t } = useTranslation();
  if (item.kind === 'tool_call') return <ToolCall item={item} />;

  return (
    <div className='border-l-2 border-border-2 pl-12px'>
      <div className='mb-5px flex items-center gap-8px text-11px text-t-tertiary'>
        <span className='font-600 text-t-secondary'>{t(ITEM_LABELS[item.kind])}</span>
        {item.timestamp ? <span>{formatSessionTimestamp(item.timestamp)}</span> : null}
        {item.truncated ? (
          <Tag size='small' color='orange'>
            {t('agent.cliSessions.truncated')}
          </Tag>
        ) : null}
      </div>
      <pre className='m-0 whitespace-pre-wrap break-words font-sans text-13px leading-21px text-t-primary'>
        {item.text}
      </pre>
    </div>
  );
};

const MetaRow: React.FC<{ label: string; value?: string; mono?: boolean }> = ({ label, value, mono }) => {
  if (!value) return null;
  return (
    <div className='grid grid-cols-[76px_minmax(0,1fr)] gap-8px text-12px leading-20px'>
      <span className='text-t-tertiary'>{label}</span>
      <span className={`min-w-0 break-all text-t-secondary ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
};

const SessionDetail: React.FC<SessionDetailProps> = ({ snapshot, loading, isMobile, onBack, onOpenSession }) => {
  const { t } = useTranslation();
  const [visibleItemLimit, setVisibleItemLimit] = useState(VISIBLE_ITEM_PAGE_SIZE);

  useEffect(() => {
    setVisibleItemLimit(VISIBLE_ITEM_PAGE_SIZE);
  }, [snapshot?.session.id]);

  const visibleTimeline = useMemo(() => {
    if (!snapshot) return { hiddenCount: 0, turns: [] };
    const totalItems = snapshot.turns.reduce((total, turn) => total + turn.items.length, 0);
    const hiddenCount = Math.max(0, totalItems - visibleItemLimit);
    let remainingToSkip = hiddenCount;
    const turns = snapshot.turns
      .map((turn, turnIndex) => {
        const skip = Math.min(remainingToSkip, turn.items.length);
        remainingToSkip -= skip;
        return { turn: { ...turn, items: turn.items.slice(skip) }, turnNumber: turnIndex + 1 };
      })
      .filter(({ turn }) => turn.items.length > 0);
    return { hiddenCount, turns };
  }, [snapshot, visibleItemLimit]);

  if (loading) {
    return (
      <div className='h-full min-h-240px flex items-center justify-center'>
        <Spin dot />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className='h-full min-h-240px flex items-center justify-center px-20px'>
        <Empty description={t('agent.cliSessions.noSelection')} />
      </div>
    );
  }

  const { session } = snapshot;
  return (
    <div className='h-full min-h-0 overflow-y-auto overscroll-contain'>
      <div className='mx-auto w-full max-w-920px box-border px-16px py-16px md:px-28px md:py-24px'>
        <div className='border-b border-border-2 pb-18px'>
          <div className='flex items-start gap-10px'>
            {isMobile ? (
              <Tooltip content={t('common.goBack')}>
                <Button
                  type='text'
                  shape='circle'
                  aria-label={t('common.goBack')}
                  icon={<ArrowLeft size='18' />}
                  onClick={onBack}
                />
              </Tooltip>
            ) : null}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-8px'>
                <h2 className='m-0 min-w-0 truncate text-18px font-700 leading-26px text-t-primary'>
                  {session.title || session.id}
                </h2>
                <Tag>{BACKEND_LABELS[session.backend]}</Tag>
                <Tag>{t(session.parent_id ? 'agent.cliSessions.childSession' : 'agent.cliSessions.mainSession')}</Tag>
                {snapshot.truncated ? <Tag color='orange'>{t('agent.cliSessions.truncated')}</Tag> : null}
              </div>
              <div className='mt-5px flex items-center gap-4px'>
                <span className='min-w-0 truncate font-mono text-11px text-t-tertiary'>{session.id}</span>
                <Tooltip content={t('common.copy')}>
                  <Button
                    type='text'
                    size='mini'
                    shape='circle'
                    aria-label={t('common.copy')}
                    icon={<Copy size='13' />}
                    onClick={() => void copyText(session.id, t('common.copySuccess'))}
                  />
                </Tooltip>
              </div>
            </div>
          </div>
          <div className='mt-14px grid gap-x-24px gap-y-4px md:grid-cols-2'>
            <MetaRow label={t('agent.cliSessions.cwd')} value={session.cwd} mono />
            <MetaRow label={t('agent.cliSessions.model')} value={session.model} />
            <MetaRow label={t('agent.cliSessions.source')} value={session.source} />
            <MetaRow label={t('agent.cliSessions.status')} value={session.status} />
            <MetaRow label={t('agent.cliSessions.created')} value={formatSessionTimestamp(session.created_at)} />
            <MetaRow label={t('agent.cliSessions.updated')} value={formatSessionTimestamp(session.updated_at)} />
            <MetaRow label={t('agent.cliSessions.parent')} value={session.parent_id} mono />
          </div>
        </div>

        {snapshot.children.length > 0 ? (
          <section className='border-b border-border-2 py-18px'>
            <h3 className='m-0 mb-8px text-13px font-700 text-t-primary'>
              {t('agent.cliSessions.children', { count: snapshot.children.length })}
            </h3>
            <div className='flex flex-col gap-4px'>
              {snapshot.children.map((child) => (
                <Button
                  key={child.id}
                  type='text'
                  long
                  className='!h-auto !justify-start !px-8px !py-7px'
                  onClick={() => onOpenSession(child)}
                >
                  <span className='w-full min-w-0 flex items-center gap-8px text-left'>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-12px font-600 text-t-primary'>
                        {child.title || child.id}
                      </span>
                      <span className='block truncate font-mono text-10px text-t-tertiary'>{child.id}</span>
                    </span>
                    {child.status ? <Tag size='small'>{child.status}</Tag> : null}
                    <Right size='13' className='text-t-tertiary' />
                  </span>
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        <section className='py-18px'>
          <h3 className='m-0 mb-14px text-13px font-700 text-t-primary'>
            {t('agent.cliSessions.turns', { count: snapshot.turns.length })}
          </h3>
          {snapshot.turns.length === 0 ? (
            <Empty description={t('agent.cliSessions.noEvents')} />
          ) : (
            <div className='flex flex-col gap-22px'>
              {visibleTimeline.hiddenCount > 0 ? (
                <div className='flex justify-center'>
                  <Button onClick={() => setVisibleItemLimit((limit) => limit + VISIBLE_ITEM_PAGE_SIZE)}>
                    {t('common.expandMore')}
                    <Tag size='small' className='ml-6px'>
                      {visibleTimeline.hiddenCount}
                    </Tag>
                  </Button>
                </div>
              ) : null}
              {visibleTimeline.turns.map(({ turn, turnNumber }) => (
                <section key={turn.id} className='border-b border-border-2 pb-22px last:border-b-0'>
                  <div className='mb-12px flex flex-wrap items-center gap-8px text-11px text-t-tertiary'>
                    <span className='font-700 text-t-secondary'>
                      {t('agent.cliSessions.turnNumber', { number: turnNumber })}
                    </span>
                    <span className='font-mono'>{turn.id}</span>
                    {turn.started_at ? <span>{formatSessionTimestamp(turn.started_at)}</span> : null}
                  </div>
                  <div className='flex flex-col gap-14px'>
                    {turn.items.map((item, itemIndex) => (
                      <TimelineItem key={item.id || `${turn.id}-${itemIndex}`} item={item} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SessionDetail;
