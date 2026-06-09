/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: { invoke: vi.fn(async () => []) },
      createCustomAgent: { invoke: vi.fn(async (payload) => ({ id: payload.id })) },
      setAgentEnabled: { invoke: vi.fn(async () => undefined) },
    },
  },
}));

import { ipcBridge } from '@/common';
import { legacyCustomAgentToCreateRequest, migrateCustomAgentsToBackend } from '@/process/utils/migrateCustomAgents';

type FakeConfig = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  store: Map<string, unknown>;
};

function makeConfig(seed: Record<string, unknown> = {}): FakeConfig {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    store,
  };
}

describe('migrateCustomAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcBridge.acpConversation.getAvailableAgents.invoke.mockResolvedValue([]);
    ipcBridge.acpConversation.createCustomAgent.invoke.mockImplementation(async (payload) => ({ id: payload.id }));
    ipcBridge.acpConversation.setAgentEnabled.invoke.mockResolvedValue(undefined);
  });

  it('maps legacy acp.customAgents rows to backend custom-agent payloads', () => {
    const result = legacyCustomAgentToCreateRequest({
      id: 'legacy-agent-id',
      name: 'Legacy Agent',
      avatar: 'test-avatar',
      defaultCliPath: '/usr/local/bin/legacy-agent',
      acpArgs: ['--acp', '--verbose'],
      env: { API_KEY: 'secret', EMPTY: 1 },
      skillsDirs: ['.legacy/skills'],
      description: 'Old description',
    });

    expect(result).toEqual({
      id: 'legacy-agent-id',
      name: 'Legacy Agent',
      icon: 'test-avatar',
      command: '/usr/local/bin/legacy-agent',
      args: ['--acp', '--verbose'],
      env: [{ name: 'API_KEY', value: 'secret' }],
      advanced: {
        native_skills_dirs: ['.legacy/skills'],
        description: 'Old description',
      },
    });
  });

  it('imports missing legacy custom agents and preserves disabled state', async () => {
    const legacyRows = [
      {
        id: 'legacy-custom-1',
        name: 'Legacy Custom',
        avatar: 'bot-avatar',
        defaultCliPath: 'legacy-cli',
        acpArgs: ['--acp'],
        enabled: false,
      },
    ];
    const config = makeConfig({ 'acp.customAgents': legacyRows });

    const result = await migrateCustomAgentsToBackend(config);

    expect(result).toBe(true);
    expect(ipcBridge.acpConversation.createCustomAgent.invoke).toHaveBeenCalledWith({
      id: 'legacy-custom-1',
      name: 'Legacy Custom',
      icon: 'bot-avatar',
      command: 'legacy-cli',
      args: ['--acp'],
      env: undefined,
      advanced: undefined,
    });
    expect(ipcBridge.acpConversation.setAgentEnabled.invoke).toHaveBeenCalledWith({
      id: 'legacy-custom-1',
      enabled: false,
    });
    expect(config.store.get('migration.customAgentsMigrated_v1')).toBe(true);
  });

  it('skips backend rows that already exist', async () => {
    const legacyRows = [{ id: 'legacy-custom-1', name: 'Legacy Custom', defaultCliPath: 'legacy-cli' }];
    const config = makeConfig({ 'acp.customAgents': legacyRows });
    ipcBridge.acpConversation.getAvailableAgents.invoke.mockResolvedValue([
      { id: 'legacy-custom-1', agent_source: 'custom' },
    ]);

    const result = await migrateCustomAgentsToBackend(config);

    expect(result).toBe(true);
    expect(ipcBridge.acpConversation.createCustomAgent.invoke).not.toHaveBeenCalled();
    expect(config.store.get('migration.customAgentsMigrated_v1')).toBe(true);
  });

  it('does not set completion flag when backend import fails', async () => {
    const config = makeConfig({
      'acp.customAgents': [{ id: 'legacy-custom-1', name: 'Legacy Custom', defaultCliPath: 'legacy-cli' }],
    });
    ipcBridge.acpConversation.createCustomAgent.invoke.mockRejectedValue(new Error('backend unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await migrateCustomAgentsToBackend(config);

    expect(result).toBe(false);
    expect(config.store.has('migration.customAgentsMigrated_v1')).toBe(false);
  });

  it('does not reread legacy rows once migration flag is set', async () => {
    const config = makeConfig({
      'migration.customAgentsMigrated_v1': true,
      'acp.customAgents': [{ id: 'legacy-custom-1', name: 'Legacy Custom', defaultCliPath: 'legacy-cli' }],
    });

    const result = await migrateCustomAgentsToBackend(config);

    expect(result).toBe(true);
    expect(ipcBridge.acpConversation.createCustomAgent.invoke).not.toHaveBeenCalled();
  });
});
