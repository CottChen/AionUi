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
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
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
        fullPath: '/repo/src',
        relativePath: 'src',
        isDir: true,
        isFile: false,
        children: [],
      },
      {
        name: 'README.md',
        fullPath: '/repo/README.md',
        relativePath: 'README.md',
        isDir: false,
        isFile: true,
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
    await vi.advanceTimersByTimeAsync(5000);
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
