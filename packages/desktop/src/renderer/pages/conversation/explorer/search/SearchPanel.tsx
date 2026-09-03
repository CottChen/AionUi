/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project filename-search skin #2: a persistent search area at the top of the
 * Explorer column (search.md §结果 UI — "same stream, two skins"). Shares the
 * exact stream/ranking the `@`-mention dropdown uses (useFileSearch → searchStore
 * → rankSearchHits).
 *
 * Layout: the search input is always present. While the query is empty the tree
 * (passed as `children`) shows; while it is non-empty a flat, streaming result
 * list replaces it. The tree stays MOUNTED across that toggle (display switch,
 * not unmount) so its WS subscriptions never thrash — empty↔non-empty is free.
 *
 * Interaction (product decision Y — find the file, don't presume intent):
 *   - clicking a result = reveal (locate in the tree), NOT preview;
 *   - add-to-chat is an explicit per-row action, shown only when a conversation
 *     is active. Preview is a deferred feature — no action wired here yet.
 */

import { Button, Input, Radio } from '@arco-design/web-react';
import { Plus, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLatestRef } from '@renderer/hooks/ui/useLatestRef';

import type { DirRef } from '../explorerModel';
import FileTypeIcon from '../fileIcon/FileTypeIcon';
import { useFileSearch } from './useFileSearch';
import { type PeNameMap, peLabeledPath, type SearchHit, searchHitKey } from './searchModel';
import { PANEL_SEARCH_OWNER, type SearchMode } from './searchStore';

export type SearchFolderTarget = {
  ref: DirRef;
  label: string;
};

type SearchScope = 'workspace' | 'folder';

export type SearchPanelProps = {
  /** Search roots = the project's bound folders (each a pe root, rel=''). */
  roots: DirRef[];
  /** pe_id → folder name for the `PE · REL` secondary label (multi-folder). */
  peNames: PeNameMap;
  /** Locate a hit in the tree (expand ancestors + select). Default click action. */
  onRevealHit: (hit: SearchHit) => void;
  /** Explicit add-to-chat for a hit. Omit to hide the action (no active conversation). */
  onAddHit?: (hit: SearchHit) => void;
  /** Folder selected through the Explorer context menu for scoped search. */
  folderTarget?: SearchFolderTarget;
  /** Changing this token exits search so an external tree reveal is visible. */
  clearRequestKey?: number;
  /** The Explorer tree — kept mounted underneath; shown only while the query is empty. */
  children: React.ReactNode;
};

export const SearchPanel: React.FC<SearchPanelProps> = ({
  roots,
  peNames,
  onRevealHit,
  onAddHit,
  folderTarget,
  clearRequestKey,
  children,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('workspace');
  const [mode, setMode] = useState<SearchMode>('name');
  const effectiveRoots = useMemo(
    () => (scope === 'folder' && folderTarget ? [folderTarget.ref] : roots),
    [folderTarget, roots, scope]
  );
  const { view, runSearch, continueSearch, cancel } = useFileSearch(PANEL_SEARCH_OWNER, effectiveRoots, mode);
  const queryRef = useLatestRef(query);
  const modeRef = useLatestRef(mode);

  useEffect(() => {
    if (clearRequestKey === undefined) return;
    setQuery('');
    cancel();
  }, [cancel, clearRequestKey]);

  useEffect(() => {
    if (!folderTarget) return;
    setScope('folder');
    const currentQuery = queryRef.current.trim();
    if (currentQuery) {
      runSearch(currentQuery, { roots: [folderTarget.ref], mode: modeRef.current });
    }
  }, [folderTarget, modeRef, queryRef, runSearch]);

  const active = query.trim().length > 0;
  // Render results only while this panel owns the shared stream. If the `@`
  // mention took over, the view holds its results — suppress them here so the
  // panel doesn't flash the other skin's hits (mutual exclusion).
  const owned = view.owner === PANEL_SEARCH_OWNER;

  const onQueryChange = useCallback(
    (value: string): void => {
      setQuery(value);
      if (value.trim().length > 0) {
        runSearch(value, { roots: effectiveRoots, mode });
      } else {
        cancel();
      }
    },
    [cancel, effectiveRoots, mode, runSearch]
  );

  const handleScopeChange = useCallback(
    (value: string): void => {
      const nextScope: SearchScope = value === 'folder' && folderTarget ? 'folder' : 'workspace';
      setScope(nextScope);
      const nextRoots = nextScope === 'folder' && folderTarget ? [folderTarget.ref] : roots;
      if (query.trim()) runSearch(query, { roots: nextRoots, mode });
    },
    [folderTarget, mode, query, roots, runSearch]
  );

  const handleModeChange = useCallback(
    (value: string): void => {
      const nextMode: SearchMode = value === 'name' || value === 'content' ? value : 'all';
      setMode(nextMode);
      if (query.trim()) runSearch(query, { roots: effectiveRoots, mode: nextMode });
    },
    [effectiveRoots, query, runSearch]
  );

  // Reveal + EXIT search: locate the hit in the tree, then clear the query so the
  // covering result list collapses and the (now-revealed) tree is visible. Without
  // the clear, the result list stays on top and hides the reveal (bug #2).
  const handleReveal = useCallback(
    (hit: SearchHit): void => {
      onRevealHit(hit);
      setQuery('');
      cancel();
    },
    [onRevealHit, cancel]
  );

  const rows = owned ? view.hits : []; // non-owner: show nothing (the other skin owns the stream)
  const showSearching = owned && view.status === 'searching' && rows.length === 0;
  const showEmpty = owned && view.status === 'done' && rows.length === 0;
  const showError = owned && view.status === 'error';
  const contentBlockCount = rows.reduce((sum, hit) => sum + (hit.content_match_count ?? 0), 0);
  const limitReason = useMemo(() => {
    const labels = view.limitReasons.map((reason) => {
      switch (reason) {
        case 'result_limit':
          return t('conversation.explorer.search.limitReason.resultLimit');
        case 'scan_limit':
          return t('conversation.explorer.search.limitReason.scanLimit');
        case 'content_byte_limit':
          return t('conversation.explorer.search.limitReason.contentByteLimit');
        case 'file_size_limit':
          return t('conversation.explorer.search.limitReason.fileSizeLimit', { count: view.skippedLargeFiles });
      }
    });
    return labels.join(' · ') || t('conversation.explorer.search.limitReason.resultLimit');
  }, [t, view.limitReasons, view.skippedLargeFiles]);

  return (
    <div className='h-full flex flex-col min-h-0'>
      {/* pt-8px 让搜索框跟上方 tab 栏那条分割线拉开距离，不再贴着它。
          pl-12px 把输入框外框对到面板基准线；输入框自带 12px 内边距会把里面的放大镜
          推到 24px，用 !pl-8px 收成 8px，图标正好落在 20px —— 与 tab 文字、树箭头
          同一条线（见 ExplorerContainer.tsx 的基准线说明）。

          pt-8px lifts the box off the tab bar's bottom border instead of touching it.
          pl-12px puts the input's outer border on the panel baseline; the input's own
          12px inner padding would push the magnifier to 24px, so !pl-8px trims it to
          8px and lands the icon at 20px — the same line as the tab text and the tree
          arrow (see the baseline note in ExplorerContainer.tsx). */}
      <div className='flex-shrink-0 pl-12px pr-8px pt-8px pb-6px'>
        <Input
          value={query}
          onChange={onQueryChange}
          allowClear
          size='small'
          className='[&_.arco-input-inner-wrapper]:!pl-8px'
          prefix={<Search theme='outline' size='14' />}
          placeholder={t('conversation.workspace.searchPlaceholder')}
          aria-label={t('conversation.workspace.searchPlaceholder')}
        />
        <div className='mt-6px flex flex-col gap-4px'>
          <Radio.Group type='button' size='small' value={scope} onChange={handleScopeChange} className='w-full flex'>
            <Radio value='workspace' className='flex-1 text-center'>
              {t('conversation.workspace.searchScope.workspace')}
            </Radio>
            <Radio value='folder' disabled={!folderTarget} className='flex-1 text-center'>
              {t('conversation.workspace.searchScope.currentFolder')}
            </Radio>
          </Radio.Group>
          <Radio.Group type='button' size='small' value={mode} onChange={handleModeChange} className='w-full flex'>
            <Radio value='all' className='flex-1 text-center'>
              {t('conversation.workspace.searchMode.all')}
            </Radio>
            <Radio value='name' className='flex-1 text-center'>
              {t('conversation.workspace.searchMode.name')}
            </Radio>
            <Radio value='content' className='flex-1 text-center'>
              {t('conversation.workspace.searchMode.content')}
            </Radio>
          </Radio.Group>
          {scope === 'folder' && folderTarget && (
            <div className='truncate px-2px text-11px text-t-tertiary' title={folderTarget.label}>
              {t('conversation.workspace.searchScope.selectedFolder', { folder: folderTarget.label })}
            </div>
          )}
          {active && owned && view.limitReached && (
            <div className='flex items-center gap-6px px-2px py-2px text-11px text-t-secondary' role='status'>
              <span className='min-w-0 flex-1'>
                {t('conversation.explorer.search.limitReached', {
                  count: view.total,
                  reason: limitReason,
                  scannedFiles: view.scannedFiles,
                })}
              </span>
              {view.nextCursor && (
                <Button type='text' size='mini' className='flex-shrink-0' onClick={continueSearch}>
                  {t('conversation.explorer.search.continue')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tree slot — always mounted; hidden (not unmounted) only while THIS panel
          owns an active search. If the `@` mention took the stream, fall back to
          showing the tree (never a blank pane) even though our query is non-empty
          — the user re-owns by typing in the box again.

          pl-12px 把树的行外框放到面板基准线上；行内箭头再由 arco-override.css 的
          .workspace-tree 规则补 8px，落到 20px。
          pl-12px puts the tree's row boxes on the panel baseline; the arrow inside
          is then offset a further 8px by the .workspace-tree rules in
          arco-override.css, landing at 20px. */}
      <div className='flex-1 min-h-0 overflow-auto pl-12px' style={active && owned ? { display: 'none' } : undefined}>
        {children}
      </div>

      {active && owned && (
        // pl-4px + 行自身 px-8px = 12px，与树、搜索框外框同一条基准线，
        // 这样输入时结果列表顶掉树的一刻不会横向跳动。
        // pl-4px plus each row's own px-8px lands on the same 12px baseline as the
        // tree and the search box, so the list replacing the tree as you type does
        // not shift sideways.
        <div className='flex-1 min-h-0 overflow-auto pl-4px pr-4px'>
          {showSearching && (
            <div className='px-8px py-6px text-t-secondary text-13px'>
              {t('conversation.explorer.search.searching')}
            </div>
          )}
          {showEmpty && (
            <div className='px-8px py-6px text-t-secondary text-13px'>{t('conversation.explorer.search.empty')}</div>
          )}
          {showError && (
            <div className='px-8px py-6px text-t-secondary text-13px'>
              {t('conversation.explorer.search.failed', { error: view.error })}
            </div>
          )}
          {owned && view.status === 'done' && rows.length > 0 && (
            <div className='px-8px pb-4px text-t-tertiary text-11px'>
              {t('conversation.workspace.searchStats', { fileCount: rows.length, contentBlockCount })}
            </div>
          )}
          {rows.map((hit) => (
            <div
              key={searchHitKey(hit)}
              role='button'
              tabIndex={0}
              onClick={() => handleReveal(hit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleReveal(hit);
                }
              }}
              className='group flex items-start gap-4px px-8px py-5px rd-4px cursor-pointer hover:bg-2 min-w-0'
              title={hit.relative_path}
            >
              <FileTypeIcon node={{ name: hit.name, relativePath: hit.relative_path, isFile: !hit.is_directory }} />
              <span className='min-w-0 flex-1 flex flex-col gap-2px'>
                <span className='flex min-w-0 items-center gap-4px'>
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap flex-shrink-0 max-w-[45%]'>
                    {hit.name}
                  </span>
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap text-t-tertiary text-12px flex-1 min-w-0'>
                    {peLabeledPath(hit.pe_id, hit.relative_path, peNames)}
                  </span>
                </span>
                {hit.content_preview && (
                  <span className='overflow-hidden text-ellipsis whitespace-nowrap text-t-secondary text-11px'>
                    {hit.content_preview}
                  </span>
                )}
              </span>
              {onAddHit && (
                <Button
                  type='text'
                  size='mini'
                  className='flex-shrink-0 opacity-0 group-hover:opacity-100'
                  icon={<Plus theme='outline' size='14' />}
                  aria-label={t('conversation.explorer.contextMenu.addToChat')}
                  title={t('conversation.explorer.contextMenu.addToChat')}
                  onClick={(e) => {
                    e.stopPropagation(); // explicit action — must not trigger row reveal
                    onAddHit(hit);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
