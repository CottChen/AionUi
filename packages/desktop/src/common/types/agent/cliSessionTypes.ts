export type AgentSessionBackend = 'codex' | 'opencode' | 'pi';
export type AgentSessionScope = 'all' | 'main' | 'child';

export type AgentSessionSummary = {
  id: string;
  backend: AgentSessionBackend;
  title?: string;
  cwd?: string;
  model?: string;
  source?: string;
  status?: string;
  parent_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type AgentSessionItemKind = 'user_message' | 'agent_message' | 'thinking' | 'tool_call';

export type AgentSessionItem = {
  kind: AgentSessionItemKind;
  id?: string;
  name?: string;
  text?: string;
  input?: unknown;
  output?: unknown;
  status?: string;
  timestamp?: string;
  truncated?: boolean;
};

export type AgentSessionTurn = {
  id: string;
  started_at?: string;
  completed_at?: string;
  items: AgentSessionItem[];
};

export type AgentSessionSnapshot = {
  session: AgentSessionSummary;
  turns: AgentSessionTurn[];
  children: AgentSessionSummary[];
  truncated: boolean;
};
