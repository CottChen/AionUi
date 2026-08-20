import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  inspect: vi.fn(),
  navigate: vi.fn(),
  isMobile: true,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    agentSessions: {
      list: { invoke: mocks.list },
      inspect: { invoke: mocks.inspect },
    },
  },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ backend: 'opencode' }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: mocks.isMobile }),
}));
vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({ default: () => <div /> }));
vi.mock('@/renderer/pages/agentSessions/SessionDetail', () => ({ default: () => <div /> }));
vi.mock('@/renderer/pages/agentSessions/SessionList', () => ({
  default: ({ sessions, loading }: { sessions: unknown[]; loading: boolean }) => (
    <div data-testid='session-list-state'>{loading ? 'loading' : `sessions:${sessions.length}`}</div>
  ),
}));

import AgentSessionsPage from '@/renderer/pages/agentSessions';

describe('CLI session page list failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile = true;
  });

  it('shows an empty list without exposing an internal backend error', async () => {
    mocks.list.mockRejectedValue(new Error('INTERNAL_ERROR'));
    const errorMessage = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<AgentSessionsPage />);

    await waitFor(() => expect(screen.getByTestId('session-list-state')).toHaveTextContent('sessions:0'));
    expect(errorMessage).not.toHaveBeenCalled();
    warning.mockRestore();
    errorMessage.mockRestore();
  });

  it('renders a persisted resizable list column on desktop', async () => {
    mocks.isMobile = false;
    mocks.list.mockResolvedValue([]);

    render(<AgentSessionsPage />);

    await waitFor(() => expect(screen.getByTestId('cli-session-split')).toBeInTheDocument());
    expect(screen.getByTestId('cli-session-split')).toHaveStyle({
      gridTemplateColumns: '300px minmax(0, 1fr)',
    });
    expect(document.querySelector('.cli-session-list-resizer')).toBeInTheDocument();
  });
});
