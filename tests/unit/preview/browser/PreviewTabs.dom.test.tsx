/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ electron: false }));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platform.electron,
}));

import PreviewTabs from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs';

const renderTabs = (onNewBrowserTab = vi.fn(), onCollapsePanel = vi.fn()) =>
  render(
    <PreviewTabs
      tabs={[{ id: 'file-1', title: 'notes.md' }]}
      activeTabId='file-1'
      tabFadeState={{ left: false, right: false }}
      tabsContainerRef={React.createRef<HTMLDivElement>()}
      onSwitchTab={vi.fn()}
      onCloseTab={vi.fn()}
      onContextMenu={vi.fn()}
      onNewBrowserTab={onNewBrowserTab}
      onCollapsePanel={onCollapsePanel}
    />
  );

describe('PreviewTabs browser entry', () => {
  beforeEach(() => {
    platform.electron = false;
  });

  it('hides the new-browser-tab action in WebUI even when a callback is supplied', () => {
    renderTabs();

    expect(screen.queryByTitle('preview.browser.newTab')).not.toBeInTheDocument();
  });

  it('keeps the new-browser-tab action available in Electron', () => {
    platform.electron = true;
    const onNewBrowserTab = vi.fn();
    renderTabs(onNewBrowserTab);

    fireEvent.click(screen.getByTitle('preview.browser.newTab'));
    expect(onNewBrowserTab).toHaveBeenCalledOnce();
  });

  it('collapses the panel without routing through a tab close action', () => {
    const onCollapsePanel = vi.fn();
    renderTabs(vi.fn(), onCollapsePanel);

    fireEvent.click(screen.getByTitle('preview.collapsePanel'));

    expect(onCollapsePanel).toHaveBeenCalledOnce();
  });
});
