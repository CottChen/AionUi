import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionSnapshot } from '@/common/types/agent/cliSessionTypes';
import SessionDetail from '@/renderer/pages/agentSessions/SessionDetail';

const baseSnapshot: AgentSessionSnapshot = {
  session: {
    id: 'child-1',
    backend: 'codex',
    parent_id: 'parent-1',
    model: 'gpt-child',
  },
  turns: [
    {
      id: 'turn-1',
      model: 'gpt-child-mini',
      items: [{ kind: 'agent_message', text: 'Done.' }],
    },
  ],
  children: [],
  truncated: false,
};

const renderDetail = (snapshot: AgentSessionSnapshot) =>
  render(
    <SessionDetail snapshot={snapshot} loading={false} isMobile={false} onBack={vi.fn()} onOpenSession={vi.fn()} />
  );

describe('CLI child session detail', () => {
  it('shows the child-received task, verified dispatch metadata, and per-turn model', () => {
    renderDetail({
      ...baseSnapshot,
      child_task: {
        prompt: 'Inspect the workspace changes.',
        agent_type: 'explorer',
        fork_context: true,
      },
    });

    expect(screen.getByText('agent.cliSessions.initialTask')).toBeInTheDocument();
    expect(screen.getByText('Inspect the workspace changes.')).toBeInTheDocument();
    expect(screen.getByText('explorer')).toBeInTheDocument();
    expect(screen.getByText('agent.cliSessions.contextIncluded')).toBeInTheDocument();
    expect(screen.getByText('gpt-child-mini')).toBeInTheDocument();
  });

  it('does not invent parent dispatch metadata when only the received task is known', () => {
    renderDetail({
      ...baseSnapshot,
      child_task: { prompt: 'Inspect the workspace changes.' },
    });

    expect(screen.getByText('Inspect the workspace changes.')).toBeInTheDocument();
    expect(screen.queryByText('agent.cliSessions.forkContext')).not.toBeInTheDocument();
  });

  it('does not repeat the initial child task in the timeline', () => {
    const prompt = 'Inspect the workspace changes.';
    renderDetail({
      ...baseSnapshot,
      turns: [
        {
          id: 'turn-1',
          items: [
            { kind: 'user_message', text: prompt },
            { kind: 'agent_message', text: 'Done.' },
          ],
        },
      ],
      child_task: { prompt },
    });

    expect(screen.getAllByText(prompt)).toHaveLength(1);
    expect(screen.getByText('Done.')).toBeInTheDocument();
  });
});
