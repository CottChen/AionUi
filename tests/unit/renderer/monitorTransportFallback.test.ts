import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFilesByDir: vi.fn(),
  wsSend: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: {
        invoke: mocks.getFilesByDir,
      },
    },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  wsSend: mocks.wsSend,
  wsEmitter: () => ({
    on: () => () => {},
    emit: () => {},
  }),
}));

import { peKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import {
  getExplorerSnapshot,
  openProject,
  resetExplorerStoreForTest,
} from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  initExplorerRuntime,
  updateProjectRootFallbackPaths,
} from '@/renderer/pages/conversation/explorer/monitorTransport';

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    // Sequential ticks drain reconcile -> request -> fallback -> snapshot.
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

describe('monitorTransport HTTP fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetExplorerStoreForTest();
    mocks.wsSend.mockReset().mockReturnValue(true);
    mocks.getFilesByDir.mockReset().mockResolvedValue([
      {
        name: 'src',
        full_path: '/repo/src',
        relative_path: 'src',
        is_dir: true,
        is_file: false,
        children: [],
      },
      {
        name: 'README.md',
        full_path: '/repo/README.md',
        relative_path: 'README.md',
        is_dir: false,
        is_file: true,
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads the root snapshot through /api/fs/dir when fs/subscribe never replies', async () => {
    initExplorerRuntime();
    updateProjectRootFallbackPaths([{ pe_id: 'pe1', title: 'repo', displayPath: '/repo', role: 'workspace' }]);

    openProject('p1', [{ pe_id: 'pe1', title: 'repo', displayPath: '/repo', role: 'workspace' }]);
    await flush();
    await vi.advanceTimersByTimeAsync(1200);
    await flush();

    expect(mocks.wsSend).toHaveBeenCalledWith(
      'fs',
      expect.objectContaining({
        method: 'fs/subscribe',
        params: { targets: [{ pe_id: 'pe1', relative_path: '' }] },
      })
    );
    expect(mocks.getFilesByDir).toHaveBeenCalledWith({ root: '/repo', dir: '/repo' });
    expect(getExplorerSnapshot().treeData[0]).toMatchObject({
      key: peKey('pe1', ''),
      title: 'repo',
      children: [
        expect.objectContaining({ title: 'src', isLeaf: false }),
        expect.objectContaining({ title: 'README.md', isLeaf: true }),
      ],
    });
  });
});
