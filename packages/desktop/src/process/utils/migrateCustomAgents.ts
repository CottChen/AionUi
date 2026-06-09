/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CustomAgentAdvancedOverrides } from '@/common/types/platform/acpTypes';

const CUSTOM_AGENTS_MIGRATION_FLAG = 'migration.customAgentsMigrated_v1';

type ConfigFile = {
  get: (key: string) => Promise<unknown>;
  set?: (key: string, value: unknown) => Promise<unknown>;
};

type LegacyCustomAgent = Record<string, unknown>;

export type CreateCustomAgentRequest = {
  id?: string;
  name: string;
  command: string;
  icon?: string;
  args?: string[];
  env?: Array<{ name: string; value: string; description?: string }>;
  advanced?: CustomAgentAdvancedOverrides;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function envRecordToEntries(value: unknown): CreateCustomAgentRequest['env'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => entry[0].trim().length > 0 && typeof entry[1] === 'string')
    .map(([name, envValue]) => ({ name, value: envValue }));
  return entries.length > 0 ? entries : undefined;
}

function buildAdvanced(legacy: LegacyCustomAgent): CustomAgentAdvancedOverrides | undefined {
  const advanced: CustomAgentAdvancedOverrides = {};
  const skillsDirs = asStringArray(legacy.skillsDirs);
  const description = asString(legacy.description);

  if (skillsDirs) advanced.native_skills_dirs = skillsDirs;
  if (description) advanced.description = description;

  return Object.keys(advanced).length > 0 ? advanced : undefined;
}

/**
 * Convert the v1.9.x `ConfigStorage('acp.customAgents')` row into the backend
 * custom-agent create contract. The legacy id must be preserved because old
 * conversations and channel settings reference it through `customAgentId`.
 */
export function legacyCustomAgentToCreateRequest(legacy: LegacyCustomAgent): CreateCustomAgentRequest | null {
  const id = asString(legacy.id);
  const command = asString(legacy.defaultCliPath) || asString(legacy.cliCommand);
  if (!id || !command) return null;

  return {
    id,
    name: asString(legacy.name) || 'Custom Agent',
    command,
    icon: asString(legacy.avatar),
    args: asStringArray(legacy.acpArgs),
    env: envRecordToEntries(legacy.env),
    advanced: buildAdvanced(legacy),
  };
}

async function markMigrationDone(configFile: ConfigFile): Promise<void> {
  if (typeof configFile.set !== 'function') return;
  try {
    await configFile.set(CUSTOM_AGENTS_MIGRATION_FLAG, true);
  } catch (error) {
    console.warn('[AionUi] failed to persist custom agents migration flag', error);
  }
}

/**
 * Import legacy custom ACP agents from `acp.customAgents` into the backend
 * `agent_metadata` catalog. Existing backend rows are skipped to avoid
 * overwriting post-migration edits or re-importing user-deleted rows after the
 * completion flag has been set.
 */
export async function migrateCustomAgentsToBackend(configFile: ConfigFile): Promise<boolean> {
  if (process.env.AIONUI_SKIP_ELECTRON_MIGRATION === '1') {
    console.log('[AionUi] Custom agent migration skipped (env flag set)');
    return false;
  }

  let alreadyMigrated = false;
  try {
    alreadyMigrated = Boolean(await configFile.get(CUSTOM_AGENTS_MIGRATION_FLAG));
  } catch {
    // Treat read errors as "not migrated yet"; a successful run writes the flag.
  }
  if (alreadyMigrated) return true;

  const legacyValue = await configFile.get('acp.customAgents').catch(() => [] as unknown);
  const legacyRows = (Array.isArray(legacyValue) ? legacyValue : []) as LegacyCustomAgent[];
  if (legacyRows.length === 0) {
    await markMigrationDone(configFile);
    return true;
  }

  const requests: CreateCustomAgentRequest[] = [];
  let invalid = 0;
  for (const row of legacyRows) {
    const request = legacyCustomAgentToCreateRequest(row);
    if (!request) {
      invalid += 1;
      continue;
    }
    requests.push(request);
  }

  if (invalid > 0) {
    console.warn(`[AionUi] Skipped ${invalid} invalid legacy custom agent row(s) during migration`);
  }
  if (requests.length === 0) {
    await markMigrationDone(configFile);
    return true;
  }

  let existingIds: Set<string>;
  try {
    const existing = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    existingIds = new Set(
      (Array.isArray(existing) ? existing : [])
        .filter((agent) => agent.agent_source === 'custom')
        .map((agent) => agent.id)
    );
  } catch (error) {
    console.error('[AionUi] Custom agent migration failed to read backend agents:', error);
    return false;
  }

  const missing = requests.filter((request) => !existingIds.has(request.id || ''));
  if (missing.length === 0) {
    await markMigrationDone(configFile);
    return true;
  }

  const results = await Promise.allSettled(
    missing.map(async (request) => {
      const created = await ipcBridge.acpConversation.createCustomAgent.invoke(request);
      const legacy = legacyRows.find((row) => row.id === request.id);
      if (legacy?.enabled === false) {
        await ipcBridge.acpConversation.setAgentEnabled.invoke({ id: created.id || request.id || '', enabled: false });
      }
    })
  );

  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) {
    console.error(`[AionUi] Custom agent migration partial: ${failed}/${missing.length} failed`);
    return false;
  }

  console.log(`[AionUi] migrated ${missing.length} custom agent(s) (skipped ${requests.length - missing.length})`);
  await markMigrationDone(configFile);
  return true;
}
