import { describe, expect, it } from 'vitest';
import { fromBackendWorkspaceSearch } from '../../../packages/desktop/src/common/adapter/workspaceMapper';

describe('fromBackendWorkspaceSearch', () => {
  it('builds directory ancestry and preserves pagination metadata', () => {
    const result = fromBackendWorkspaceSearch(
      {
        entries: [
          { name: 'src', type: 'directory', match_kind: 'name' },
          { name: 'src/components/Button.tsx', type: 'file', match_kind: 'content', content_match_count: 3 },
        ],
        next_cursor: '200',
        scanned: 200,
        truncated: true,
      },
      '/workspace'
    );

    const root = result.tree[0];
    const src = root?.children?.find((node) => node.relativePath === 'src');
    const components = src?.children?.find((node) => node.relativePath === 'src/components');
    const button = components?.children?.find((node) => node.relativePath === 'src/components/Button.tsx');

    expect(src?.searchMatchKind).toBe('name');
    expect(button?.searchMatchKind).toBe('content');
    expect(button?.searchContentMatchCount).toBe(3);
    expect(button?.fullPath).toBe('/workspace/src/components/Button.tsx');
    expect(result.nextCursor).toBe('200');
    expect(result.scanned).toBe(200);
    expect(result.truncated).toBe(true);
  });
});
