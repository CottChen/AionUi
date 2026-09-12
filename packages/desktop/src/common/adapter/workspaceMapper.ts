/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile, IWorkspaceFlatFile } from './ipcBridge';

type RawFsEntry = {
  name: string;
  type: string;
  match_kind?: 'name' | 'content';
  content_match_count?: number;
};
export type RawWorkspaceFlatFile = { name: string; full_path: string; relative_path: string };
export type RawWorkspaceSearchResponse = {
  entries: RawFsEntry[];
  next_cursor?: string;
  scanned: number;
  truncated: boolean;
};

function sortWorkspaceSearchChildren(nodes: IDirOrFile[]): void {
  nodes.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  nodes.forEach((node) => node.children && sortWorkspaceSearchChildren(node.children));
}

// ── Path helpers ───────────────────────────────────────────────────────

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

// ── Frontend → Backend ─────────────────────────────────────────────────

export function absoluteToRelativePath(absolutePath: string, workspace: string): string {
  if (!absolutePath || !workspace) return absolutePath || '.';
  const abs = stripTrailingSlash(normalizeSlashes(absolutePath));
  const ws = stripTrailingSlash(normalizeSlashes(workspace));
  if (abs === ws) return '.';
  if (abs.startsWith(ws + '/')) {
    return abs.slice(ws.length + 1) || '.';
  }
  return absolutePath;
}

// ── Backend → Frontend ─────────────────────────────────────────────────

export function fromBackendFsEntry(item: RawFsEntry, workspace: string, parentRelPath: string): IDirOrFile {
  const ws = stripTrailingSlash(workspace);
  const name = item.name || '';
  const isDir = item.type === 'directory';
  const relativePath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return {
    name,
    fullPath: `${ws}/${relativePath}`,
    relativePath,
    isDir,
    isFile: !isDir,
    searchMatchKind: item.match_kind,
    searchContentMatchCount: item.content_match_count,
  };
}

export function fromBackendWorkspaceSearch(
  raw: RawWorkspaceSearchResponse,
  workspace: string
): { tree: IDirOrFile[]; nextCursor?: string; scanned: number; truncated: boolean } {
  const ws = stripTrailingSlash(workspace);
  const rootName = ws.split('/').pop() || '';
  const root: IDirOrFile = { name: rootName, fullPath: ws, relativePath: '', isDir: true, isFile: false, children: [] };
  const dirs = new Map<string, IDirOrFile>([['', root]]);

  const ensureDir = (relativePath: string): IDirOrFile => {
    const normalized = stripTrailingSlash(normalizeSlashes(relativePath));
    const existing = dirs.get(normalized);
    if (existing) return existing;
    const parts = normalized.split('/');
    const parent = ensureDir(parts.slice(0, -1).join('/'));
    const node: IDirOrFile = {
      name: parts[parts.length - 1] || rootName,
      fullPath: `${ws}/${normalized}`,
      relativePath: normalized,
      isDir: true,
      isFile: false,
      children: [],
    };
    parent.children!.push(node);
    dirs.set(normalized, node);
    return node;
  };

  for (const entry of raw.entries) {
    const relativePath = normalizeSlashes(entry.name).replace(/^\/+/, '');
    if (!relativePath) continue;
    const isDir = entry.type === 'directory';
    if (isDir) {
      const node = ensureDir(relativePath);
      node.searchMatchKind = entry.match_kind;
      continue;
    }
    const parts = relativePath.split('/');
    const parent = ensureDir(parts.slice(0, -1).join('/'));
    const node: IDirOrFile = {
      name: parts[parts.length - 1],
      fullPath: `${ws}/${relativePath}`,
      relativePath,
      isDir: false,
      isFile: true,
      searchMatchKind: entry.match_kind,
      searchContentMatchCount: entry.content_match_count,
    };
    parent.children!.push(node);
  }

  sortWorkspaceSearchChildren(root.children ?? []);
  return { tree: [root], nextCursor: raw.next_cursor, scanned: raw.scanned, truncated: raw.truncated };
}

export function fromBackendWorkspaceList(raw: RawFsEntry[], workspace: string, relPath: string): IDirOrFile[] {
  const ws = stripTrailingSlash(workspace);
  const base = relPath === '.' ? '' : relPath;
  const children = raw.map((item) => fromBackendFsEntry(item, ws, base));

  if (relPath === '.' || !relPath) {
    const rootName = ws.split('/').pop() || '';
    return [
      {
        name: rootName,
        fullPath: ws,
        relativePath: '',
        isDir: true,
        isFile: false,
        children,
      },
    ];
  }

  const dirName = relPath.split('/').pop() || '';
  return [
    {
      name: dirName,
      fullPath: `${ws}/${relPath}`,
      relativePath: relPath,
      isDir: true,
      isFile: false,
      children,
    },
  ];
}

export function fromBackendWorkspaceFlatFiles(raw: RawWorkspaceFlatFile[]): IWorkspaceFlatFile[] {
  return raw.map((item) => ({
    name: item.name,
    fullPath: item.full_path,
    relativePath: item.relative_path,
  }));
}
