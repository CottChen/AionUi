import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentSessionSummary } from '@/common/types/agent/cliSessionTypes';
import SessionList from '@/renderer/pages/agentSessions/SessionList';

const sessions: AgentSessionSummary[] = Array.from({ length: 20 }, (_, index) => ({
  id: `session-${index}`,
  backend: 'codex',
  title: `Session ${index}`,
  updated_at: '2026-08-12T00:00:00Z',
}));

describe('CLI session list on touch layouts', () => {
  it('owns a momentum-enabled vertical scroll container', () => {
    render(<SessionList sessions={sessions} loading={false} onSelect={vi.fn()} />);

    const scroll = screen.getByTestId('cli-session-list-scroll');
    expect(scroll).toHaveClass('overflow-y-auto', 'overscroll-contain', 'touch-pan-y');
  });

  it('keeps the empty state available without rendering session controls', () => {
    render(<SessionList sessions={[]} loading={false} onSelect={vi.fn()} />);

    expect(screen.queryByTestId('cli-session-list-scroll')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
