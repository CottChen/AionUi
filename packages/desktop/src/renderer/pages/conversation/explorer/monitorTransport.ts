/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Binds the MonitorClient + explorer store to the shared WS singleton
 * (`httpBridge`). This is the thin production wiring — the pairing/store logic
 * it connects is covered by unit tests; the live socket path is exercised by
 * end-to-end integration against a running aioncore backend.
 */

import { ipcBridge } from '@/common';
import { wsEmitter, wsSend } from '@/common/adapter/httpBridge';

import type { DirRef, Entry, RootRef } from './explorerModel';
import type { SubscribeResult } from './explorerStore';
import { applyMonitorNotification, configureExplorerStore, onReconnect } from './explorerStore';
import type { MonitorTransport } from './monitorClient';
import { MonitorClient } from './monitorClient';
import {
  applySearchMatch,
  configureSearchStore,
  type SearchMatchParams,
  type SearchResult,
} from './search/searchStore';

const FS_EVENT = 'fs';
const RECONNECT_EVENT = 'realtime.reconnected';
const SUBSCRIBE_TIMEOUT_MS = 5000;

const rootFallbackPaths = new Map<string, string>();

const delayReject = (ms: number): Promise<never> =>
  new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(`fs monitor request timed out after ${ms}ms`)), ms);
  });

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => Promise.race([promise, delayReject(ms)]);

const joinDisplayPath = (root: string, relativePath: string): string => {
  if (!relativePath) return root;
  const sep = root.includes('\\') ? '\\' : '/';
  const suffix = relativePath.split('/').filter(Boolean).join(sep);
  return root.endsWith('/') || root.endsWith('\\') ? `${root}${suffix}` : `${root}${sep}${suffix}`;
};

const fallbackSubscribe = async (refs: DirRef[]): Promise<SubscribeResult> => {
  const snapshots = await Promise.all(
    refs.map(async (ref) => {
      const root = rootFallbackPaths.get(ref.pe_id);
      if (!root) throw new Error(`missing fallback path for ${ref.pe_id}`);
      const dir = joinDisplayPath(root, ref.relative_path);
      const items = await ipcBridge.fs.getFilesByDir.invoke({ root, dir });
      return {
        target: ref,
        entries: items.map((item) => ({ name: item.name, kind: item.isDir ? 'dir' : 'file' }) satisfies Entry),
      };
    })
  );
  return { snapshots };
};

export function updateProjectRootFallbackPaths(roots: RootRef[]): void {
  rootFallbackPaths.clear();
  for (const root of roots) {
    if (root.displayPath) rootFallbackPaths.set(root.pe_id, root.displayPath);
  }
}

/** Transport over the WS singleton: `fs` event族 in, `wsSend('fs', …)` out. */
export function createWsMonitorTransport(): MonitorTransport {
  return {
    send: (frame) => wsSend(FS_EVENT, frame),
    onFrame: (cb) => wsEmitter<unknown>(FS_EVENT).on(cb),
    onReconnect: (cb) => wsEmitter(RECONNECT_EVENT).on(cb),
  };
}

type MonitorRequestResult = { snapshots: Array<{ target: DirRef; entries: Entry[] }> };

/**
 * One connection, one notification dispatcher: `fs/searchMatch` feeds the search
 * store; everything else (`fs/snapshot` | `fs/delta`) feeds the explorer store.
 * Exported so the routing (search vs explorer isolation) is unit-tested directly
 * rather than through a closure.
 */
export const dispatchMonitorNotification = (method: string, params: unknown): void => {
  if (method === 'fs/searchMatch') {
    applySearchMatch(params as SearchMatchParams);
  } else {
    applyMonitorNotification(method, params);
  }
};

let client: MonitorClient | null = null;

/**
 * Wire the explorer runtime once: MonitorClient over the WS transport, store
 * notifications + reconnect, and the store's subscribe/unsubscribe port. Safe to
 * call repeatedly (idempotent). Returns the shared client.
 */
export function initExplorerRuntime(): MonitorClient {
  if (client) return client;

  const transport = createWsMonitorTransport();
  const monitor = new MonitorClient({
    transport,
    onNotification: dispatchMonitorNotification,
    onReconnect,
  });
  client = monitor;

  configureExplorerStore({
    subscribe: async (refs: DirRef[]): Promise<SubscribeResult> => {
      try {
        const result = (await withTimeout(
          monitor.request('fs/subscribe', { targets: refs }),
          SUBSCRIBE_TIMEOUT_MS
        )) as MonitorRequestResult;
        return { snapshots: result.snapshots };
      } catch (err) {
        console.warn('[monitor] fs/subscribe failed; falling back to /api/fs/dir', err);
        return fallbackSubscribe(refs);
      }
    },
    unsubscribe: (refs: DirRef[]): void => {
      monitor.notify('fs/unsubscribe', { targets: refs });
    },
  });

  configureSearchStore({
    search: (params) => {
      const { id, result } = monitor.requestWithId('fs/search', params);
      return { id, result: result as Promise<SearchResult> };
    },
    cancel: (searchId): void => {
      monitor.notify('fs/searchCancel', { search_id: searchId });
    },
    abandon: (searchId): void => {
      monitor.abandon(searchId);
    },
  });

  return monitor;
}
