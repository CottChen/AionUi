/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ChatSearchPanelOpenDetail } from '@/renderer/utils/chat/chatMinimapEvents';
import { CHAT_SEARCH_PANEL_OPEN_EVENT, dispatchChatMessageJump } from '@/renderer/utils/chat/chatMinimapEvents';
import { isPrimaryApplicationShortcut } from '@/renderer/utils/ui/keyboardShortcuts';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MinimapVisualStyle, TurnPreviewItem } from './minimapTypes';
import {
  defaultVisualStyle,
  HEADER_HEIGHT,
  ITEM_ROW_ESTIMATED_HEIGHT,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_MIN_HEIGHT,
  PANEL_OFFSET,
  PANEL_VISIBLE_ITEM_CAP,
} from './minimapTypes';
import { getPanelWidth, normalizeText, parseTurnIndexSearch, readPopoverVisualStyle } from './minimapUtils';

const TURN_PREVIEW_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 200;

// Return type for the useMinimapPanel hook
type UseMinimapPanelReturn = {
  visible: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  total: number;
  items: TurnPreviewItem[];
  searchKeyword: string;
  isSearchMode: boolean;
  activeResultIndex: number;
  panelWidth: number;
  panelPos: { left: number; top: number };
  visualStyle: MinimapVisualStyle;
  triggerRef: React.RefObject<HTMLSpanElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<RefInputType | null>;
  normalizedKeyword: string;
  filteredItems: TurnPreviewItem[];
  panelHeight: number;
  setSearchKeyword: (keyword: string) => void;
  setActiveResultIndex: React.Dispatch<React.SetStateAction<number>>;
  loadMore: () => void;
  loadQuestionText: (item: TurnPreviewItem) => Promise<string>;
  togglePanel: () => void;
  openSearchPanel: () => void;
  jumpToItem: (item?: TurnPreviewItem) => void;
  handleSearchInputBlur: () => void;
  handleSearchInputCompositionStart: () => void;
  handleSearchInputCompositionEnd: () => void;
};

/**
 * Extracts all state management and side effects for the ConversationTitleMinimap component.
 */
export const useMinimapPanel = (conversation_id?: string): UseMinimapPanelReturn => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<TurnPreviewItem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [panelWidth, setPanelWidth] = useState(getPanelWidth);
  const [panelPos, setPanelPos] = useState({ left: PANEL_MARGIN, top: PANEL_MARGIN });
  const [visualStyle, setVisualStyle] = useState<MinimapVisualStyle>(defaultVisualStyle);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<RefInputType | null>(null);
  const isSearchInputComposingRef = useRef(false);
  const pendingCloseAfterCompositionRef = useRef(false);
  const searchKeywordRef = useRef('');
  const nextCursorRef = useRef<string | undefined>(undefined);
  const requestGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // Reset on conversation switch
  useEffect(() => {
    setVisible(false);
    setLoading(false);
    setLoadingMore(false);
    setHasMore(false);
    setTotal(0);
    setItems([]);
    setSearchKeyword('');
    setDebouncedKeyword('');
    searchKeywordRef.current = '';
    setIsSearchMode(false);
    setActiveResultIndex(-1);
    isSearchInputComposingRef.current = false;
    pendingCloseAfterCompositionRef.current = false;
    nextCursorRef.current = undefined;
    loadingMoreRef.current = false;
    requestGenerationRef.current += 1;
  }, [conversation_id]);

  // Sync searchKeyword to ref
  useEffect(() => {
    searchKeywordRef.current = searchKeyword;
  }, [searchKeyword]);

  // Visual style theme listener
  useEffect(() => {
    const refresh = () => {
      setVisualStyle(readPopoverVisualStyle());
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(normalizeText(searchKeyword));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchKeyword, visible]);

  const mapPreview = useCallback(
    (item: {
      index: number;
      message_id: string;
      msg_id?: string;
      question: string;
      answer: string;
    }): TurnPreviewItem => ({
      index: item.index,
      question: item.question,
      answer: item.answer,
      questionRaw: normalizeText(item.question),
      answerRaw: normalizeText(item.answer),
      messageId: item.message_id,
      msgId: item.msg_id,
    }),
    []
  );
  const requestedTurnIndex = useMemo(() => parseTurnIndexSearch(debouncedKeyword), [debouncedKeyword]);

  useEffect(() => {
    if (!visible || !conversation_id) return;

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    loadingMoreRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setItems([]);
    setHasMore(false);
    nextCursorRef.current = undefined;

    void ipcBridge.database.getConversationTurnPreviews
      .invoke({
        conversation_id,
        limit: TURN_PREVIEW_PAGE_SIZE,
        ...(debouncedKeyword ? { keyword: debouncedKeyword } : {}),
        ...(requestedTurnIndex ? { turn_index: requestedTurnIndex } : {}),
      })
      .then((page) => {
        if (requestGenerationRef.current !== generation) return;
        setItems(page.items.map(mapPreview));
        setTotal(page.total);
        setHasMore(page.has_more);
        nextCursorRef.current = page.next_cursor ?? undefined;
      })
      .catch((error) => {
        if (requestGenerationRef.current !== generation) return;
        console.error('[ConversationTitleMinimap] Failed to load turn previews:', error);
        setItems([]);
        setTotal(0);
        setHasMore(false);
        nextCursorRef.current = undefined;
      })
      .finally(() => {
        if (requestGenerationRef.current === generation) setLoading(false);
      });

    return () => {
      if (requestGenerationRef.current === generation) requestGenerationRef.current += 1;
    };
  }, [conversation_id, debouncedKeyword, mapPreview, requestedTurnIndex, visible]);

  const loadMore = useCallback(() => {
    const after = nextCursorRef.current;
    if (!visible || !conversation_id || !hasMore || !after || loading || loadingMoreRef.current) return;

    const generation = requestGenerationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void ipcBridge.database.getConversationTurnPreviews
      .invoke({
        conversation_id,
        limit: TURN_PREVIEW_PAGE_SIZE,
        after,
        ...(debouncedKeyword ? { keyword: debouncedKeyword } : {}),
        ...(requestedTurnIndex ? { turn_index: requestedTurnIndex } : {}),
      })
      .then((page) => {
        if (requestGenerationRef.current !== generation) return;
        setItems((current) => {
          const known = new Set(current.map((item) => item.messageId));
          return [...current, ...page.items.filter((item) => !known.has(item.message_id)).map(mapPreview)];
        });
        setTotal(page.total);
        setHasMore(page.has_more);
        nextCursorRef.current = page.next_cursor ?? undefined;
      })
      .catch((error) => {
        if (requestGenerationRef.current !== generation) return;
        console.error('[ConversationTitleMinimap] Failed to load more turn previews:', error);
      })
      .finally(() => {
        if (requestGenerationRef.current !== generation) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [conversation_id, debouncedKeyword, hasMore, loading, mapPreview, requestedTurnIndex, visible]);

  const loadQuestionText = useCallback(
    async (item: TurnPreviewItem) => {
      if (!conversation_id || !item.messageId) throw new Error('Conversation message is unavailable');
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id,
        message_id: item.messageId,
      });
      if (message.type !== 'text' || typeof message.content?.content !== 'string') {
        throw new Error('Conversation message is not text');
      }
      return message.content.content;
    },
    [conversation_id]
  );

  const normalizedKeyword = useMemo(() => debouncedKeyword.toLowerCase(), [debouncedKeyword]);
  const filteredItems = items;

  const panelHeight = useMemo(() => {
    if (loading) return PANEL_MIN_HEIGHT;
    if (!items.length || !filteredItems.length) return PANEL_MIN_HEIGHT;
    const visibleRows = Math.min(filteredItems.length, PANEL_VISIBLE_ITEM_CAP);
    const computed = HEADER_HEIGHT + 12 + visibleRows * ITEM_ROW_ESTIMATED_HEIGHT;
    return Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_HEIGHT, computed));
  }, [filteredItems.length, items.length, loading]);

  // Panel positioning — always center within the chat header area
  const updatePanelLayout = useCallback((height = PANEL_HEIGHT) => {
    if (typeof window === 'undefined') return;
    const width = getPanelWidth();

    let left: number;
    let top: number;

    const isNarrow = window.innerWidth < 768;
    const header = document.querySelector('.chat-layout-header');
    if (isNarrow) {
      // On narrow viewports, align flush with margins
      left = PANEL_MARGIN;
      top = header ? header.getBoundingClientRect().bottom + PANEL_OFFSET : 60;
    } else if (header) {
      const headerRect = header.getBoundingClientRect();
      left = headerRect.left + Math.round((headerRect.width - width) / 2);
      top = headerRect.bottom + PANEL_OFFSET;
    } else {
      left = Math.round((window.innerWidth - width) / 2);
      top = 60;
    }

    left = Math.max(PANEL_MARGIN, Math.min(left, window.innerWidth - width - PANEL_MARGIN));
    top = Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - height - PANEL_MARGIN));
    setPanelWidth(width);
    setPanelPos({ left: Math.round(left), top: Math.round(top) });
  }, []);

  // Handlers
  const openSearchPanel = useCallback(() => {
    if (!conversation_id) return;
    updatePanelLayout(panelHeight);
    setVisualStyle(readPopoverVisualStyle());
    setVisible(true);
    setIsSearchMode(true);
  }, [conversation_id, panelHeight, updatePanelLayout]);

  const togglePanel = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      if (next) {
        updatePanelLayout(panelHeight);
        setVisualStyle(readPopoverVisualStyle());
      } else {
        setIsSearchMode(false);
      }
      return next;
    });
  }, [panelHeight, updatePanelLayout]);

  const collapseSearchModeIfIdle = useCallback(() => {
    if (isSearchInputComposingRef.current) return;
    if (normalizeText(searchKeywordRef.current)) return;
    if (searchInputRef.current?.dom === document.activeElement) return;
    setIsSearchMode(false);
  }, []);

  const handleSearchInputBlur = useCallback(() => {
    window.setTimeout(() => {
      collapseSearchModeIfIdle();
    }, 0);
  }, [collapseSearchModeIfIdle]);

  const handleSearchInputCompositionStart = useCallback(() => {
    isSearchInputComposingRef.current = true;
    pendingCloseAfterCompositionRef.current = false;
  }, []);

  const handleSearchInputCompositionEnd = useCallback(() => {
    isSearchInputComposingRef.current = false;
    if (pendingCloseAfterCompositionRef.current) {
      pendingCloseAfterCompositionRef.current = false;
      setVisible(false);
      return;
    }
    window.setTimeout(() => {
      collapseSearchModeIfIdle();
    }, 0);
  }, [collapseSearchModeIfIdle]);

  // Panel positioning on visibility change
  useLayoutEffect(() => {
    if (!visible) return;
    updatePanelLayout(panelHeight);
    setVisualStyle(readPopoverVisualStyle());
    const handleViewportChange = () => {
      updatePanelLayout(panelHeight);
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [panelHeight, visible, updatePanelLayout]);

  // Click-outside to close
  useEffect(() => {
    if (!visible) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (isSearchInputComposingRef.current) {
        pendingCloseAfterCompositionRef.current = true;
        return;
      }
      setVisible(false);
      setIsSearchMode(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVisible(false);
        setIsSearchMode(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible]);

  // Open on request from the anchor rail, which now carries the primary search
  // entry. Scoped to this conversation so a stale rail cannot open the wrong panel.
  useEffect(() => {
    if (!conversation_id) return;
    const handleOpenRequest = (event: Event) => {
      const detail = (event as CustomEvent<ChatSearchPanelOpenDetail>).detail;
      if (!detail || detail.conversation_id !== conversation_id) return;
      openSearchPanel();
    };
    window.addEventListener(CHAT_SEARCH_PANEL_OPEN_EVENT, handleOpenRequest);
    return () => {
      window.removeEventListener(CHAT_SEARCH_PANEL_OPEN_EVENT, handleOpenRequest);
    };
  }, [conversation_id, openSearchPanel]);

  // Global search shortcut (Cmd/Ctrl+F)
  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (!isPrimaryApplicationShortcut(event, { key: 'f', targetGuard: 'embedded-editor' })) return;
      // Keep browser/native find behavior in WebUI; intercept only desktop runtime.
      if (typeof window !== 'undefined' && !window.electronAPI) return;
      if (!conversation_id) return;
      event.preventDefault();
      openSearchPanel();
    };
    document.addEventListener('keydown', handleGlobalSearchShortcut, true);
    return () => {
      document.removeEventListener('keydown', handleGlobalSearchShortcut, true);
    };
  }, [conversation_id, openSearchPanel]);

  // Search focus
  useEffect(() => {
    if (!visible || !isSearchMode) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isSearchMode, visible]);

  // Active result index management
  useEffect(() => {
    if (!visible || !isSearchMode || loading || !filteredItems.length) {
      setActiveResultIndex(-1);
      return;
    }
    setActiveResultIndex((prev) => {
      if (prev < 0 || prev >= filteredItems.length) return 0;
      return prev;
    });
  }, [filteredItems.length, isSearchMode, loading, visible]);

  // Jump to item
  const jumpToItem = useCallback(
    (item?: TurnPreviewItem) => {
      if (!conversation_id || !item) return;
      dispatchChatMessageJump({
        conversation_id,
        messageId: item.messageId,
        msgId: item.msgId,
        align: 'start',
        behavior: 'smooth',
      });
      setVisible(false);
      setIsSearchMode(false);
    },
    [conversation_id]
  );

  // Keyboard navigation for search results
  useEffect(() => {
    if (!visible || !isSearchMode) return;
    const handleResultNavigate = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event as unknown as { isComposing?: boolean }).isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if ((key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter') || !filteredItems.length) return;

      event.preventDefault();
      if (key === 'ArrowDown') {
        setActiveResultIndex((prev) => {
          const from = prev < 0 ? 0 : prev;
          return (from + 1) % filteredItems.length;
        });
        return;
      }
      if (key === 'ArrowUp') {
        setActiveResultIndex((prev) => {
          const from = prev < 0 ? 0 : prev;
          return (from - 1 + filteredItems.length) % filteredItems.length;
        });
        return;
      }
      const targetIndex = activeResultIndex >= 0 && activeResultIndex < filteredItems.length ? activeResultIndex : 0;
      jumpToItem(filteredItems[targetIndex]);
    };
    document.addEventListener('keydown', handleResultNavigate, true);
    return () => {
      document.removeEventListener('keydown', handleResultNavigate, true);
    };
  }, [activeResultIndex, filteredItems, isSearchMode, jumpToItem, visible]);

  return {
    visible,
    loading,
    loadingMore,
    hasMore,
    total,
    items,
    searchKeyword,
    isSearchMode,
    activeResultIndex,
    panelWidth,
    panelPos,
    visualStyle,
    triggerRef,
    panelRef,
    searchInputRef,
    normalizedKeyword,
    filteredItems,
    panelHeight,
    setSearchKeyword,
    setActiveResultIndex,
    loadMore,
    loadQuestionText,
    togglePanel,
    openSearchPanel,
    jumpToItem,
    handleSearchInputBlur,
    handleSearchInputCompositionStart,
    handleSearchInputCompositionEnd,
  };
};
