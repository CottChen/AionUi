/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import useDebounce from '@/renderer/hooks/ui/useDebounce';
import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkspaceSearchMode = 'all' | 'name' | 'content';
export type WorkspaceSearchScope = 'workspace' | 'currentFolder';

type UseWorkspaceSearchParams = {
  workspace: string;
  conversation_id: string;
  expandedKeys: string[];
  setFiles: React.Dispatch<React.SetStateAction<IDirOrFile[]>>;
  setExpandedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  setTreeKey: React.Dispatch<React.SetStateAction<number>>;
  refreshWorkspace: () => void;
};

const mergeSearchNodes = (left: IDirOrFile, right: IDirOrFile): IDirOrFile => {
  if (left.isFile || right.isFile) return right;
  const children = [...(left.children ?? [])];
  for (const rightChild of right.children ?? []) {
    const index = children.findIndex((child) => child.relativePath === rightChild.relativePath);
    if (index === -1) children.push(rightChild);
    else children[index] = mergeSearchNodes(children[index], rightChild);
  }
  return { ...left, ...right, children };
};

const mergeSearchTrees = (current: IDirOrFile[], incoming: IDirOrFile[]): IDirOrFile[] => {
  const merged = [...current];
  for (const incomingNode of incoming) {
    const index = merged.findIndex((node) => node.relativePath === incomingNode.relativePath);
    if (index === -1) merged.push(incomingNode);
    else merged[index] = mergeSearchNodes(merged[index], incomingNode);
  }
  return merged;
};

/** Manages backend-backed workspace search, scope selection, and cursor pages. */
export function useWorkspaceSearch({
  workspace,
  conversation_id,
  expandedKeys,
  setFiles,
  setExpandedKeys,
  setTreeKey,
  refreshWorkspace,
}: UseWorkspaceSearchParams) {
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const [searchMode, setSearchMode] = useState<WorkspaceSearchMode>('all');
  const [searchScope, setSearchScope] = useState<WorkspaceSearchScope>('workspace');
  const [searchFolderPath, setSearchFolderPath] = useState(workspace);
  const [searchFolderLabel, setSearchFolderLabel] = useState('');
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showHostFileSelector, setShowHostFileSelector] = useState(false);
  const previousShowSearchRef = useRef<boolean | null>(null);
  const preSearchExpandedKeysRef = useRef<string[] | null>(null);
  const expandedKeysRef = useRef(expandedKeys);
  expandedKeysRef.current = expandedKeys;
  const searchSeqRef = useRef(0);

  useEffect(() => {
    searchSeqRef.current += 1;
    preSearchExpandedKeysRef.current = null;
    setSearchText('');
    setSearchMode('all');
    setSearchScope('workspace');
    setSearchFolderPath(workspace);
    setSearchFolderLabel('');
    setNextCursor(undefined);
  }, [workspace]);

  useEffect(() => {
    if (previousShowSearchRef.current === null) {
      previousShowSearchRef.current = showSearch;
      return;
    }
    if (showSearch && !previousShowSearchRef.current) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      previousShowSearchRef.current = showSearch;
      return () => window.clearTimeout(timer);
    }
    previousShowSearchRef.current = showSearch;
  }, [showSearch]);

  const runSearch = useCallback(
    async (
      value: string,
      mode = searchMode,
      scope = searchScope,
      folderPath = searchFolderPath,
      cursor?: string,
      append = false
    ) => {
      const term = value.trim();
      if (!term) {
        searchSeqRef.current += 1;
        setNextCursor(undefined);
        setSearchLoading(false);
        if (preSearchExpandedKeysRef.current !== null) {
          setExpandedKeys(preSearchExpandedKeysRef.current);
          preSearchExpandedKeysRef.current = null;
        }
        setShowSearch(true);
        refreshWorkspace();
        return;
      }

      if (preSearchExpandedKeysRef.current === null) {
        preSearchExpandedKeysRef.current = [...expandedKeysRef.current];
      }
      const seq = append ? searchSeqRef.current : ++searchSeqRef.current;
      setSearchLoading(true);
      try {
        const result = await ipcBridge.conversation.searchWorkspace.invoke({
          conversation_id,
          workspace,
          path: scope === 'currentFolder' ? folderPath : workspace,
          search: term,
          searchMode: mode,
          cursor,
          respectGitignore: scope === 'workspace',
        });
        if (seq !== searchSeqRef.current) return;
        setFiles((previous) => (append ? mergeSearchTrees(previous, result.tree) : result.tree));
        setExpandedKeys((previous) =>
          append ? [...new Set([...previous, ...collectExpandedKeys(result.tree)])] : collectExpandedKeys(result.tree)
        );
        setTreeKey(Math.random());
        setNextCursor(result.nextCursor);
        setShowSearch(true);
      } catch (error) {
        if (seq === searchSeqRef.current) console.error('[useWorkspaceSearch] search failed:', error);
      } finally {
        if (seq === searchSeqRef.current) setSearchLoading(false);
      }
    },
    [
      conversation_id,
      refreshWorkspace,
      searchFolderPath,
      searchMode,
      searchScope,
      setExpandedKeys,
      setFiles,
      setTreeKey,
      workspace,
    ]
  );

  const onSearch = useDebounce((value: string) => void runSearch(value), 200, [runSearch]);

  const updateSearchMode = useCallback(
    (mode: WorkspaceSearchMode) => {
      setSearchMode(mode);
      if (searchText.trim()) void runSearch(searchText, mode);
    },
    [runSearch, searchText]
  );

  const updateSearchScope = useCallback(
    (scope: WorkspaceSearchScope) => {
      setSearchScope(scope);
      if (searchText.trim()) void runSearch(searchText, searchMode, scope);
    },
    [runSearch, searchMode, searchText]
  );

  const selectSearchFolder = useCallback(
    (folderPath: string, folderLabel: string) => {
      setSearchFolderPath(folderPath);
      setSearchFolderLabel(folderLabel);
      setSearchScope('currentFolder');
      if (searchText.trim()) void runSearch(searchText, searchMode, 'currentFolder', folderPath);
    },
    [runSearch, searchMode, searchText]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || searchLoading || !searchText.trim()) return;
    void runSearch(searchText, searchMode, searchScope, searchFolderPath, nextCursor, true);
  }, [nextCursor, runSearch, searchFolderPath, searchLoading, searchMode, searchScope, searchText]);

  const handleHostFileSelected = useCallback(
    (
      paths: string[] | undefined,
      handleFilesToAdd: (files: Array<{ name: string; path: string }>) => Promise<void>
    ) => {
      setShowHostFileSelector(false);
      if (paths?.length) void handleFilesToAdd(paths.map((path) => ({ name: path.split('/').pop() || path, path })));
    },
    []
  );

  return {
    searchText,
    setSearchText,
    showSearch,
    setShowSearch,
    searchMode,
    setSearchMode: updateSearchMode,
    searchScope,
    setSearchScope: updateSearchScope,
    searchFolderLabel,
    selectSearchFolder,
    hasMore: Boolean(nextCursor),
    searchLoading,
    loadMore,
    searchInputRef,
    onSearch,
    showHostFileSelector,
    setShowHostFileSelector,
    handleHostFileSelected,
  };
}

const collectExpandedKeys = (nodes: IDirOrFile[]): string[] => {
  const keys: string[] = [];
  const visit = (node: IDirOrFile) => {
    if (!node.isFile && node.relativePath) keys.push(node.relativePath);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return keys;
};
