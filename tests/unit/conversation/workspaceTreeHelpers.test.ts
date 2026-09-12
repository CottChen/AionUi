import { describe, expect, it } from 'vitest';
import { buildSearchTree } from '../../../packages/desktop/src/renderer/pages/conversation/Workspace/utils/treeHelpers';

const files = [
  { name: 'Button.tsx', fullPath: '/workspace/src/components/Button.tsx', relativePath: 'src/components/Button.tsx' },
  { name: 'guide.md', fullPath: '/workspace/docs/guide.md', relativePath: 'docs/guide.md' },
];

describe('buildSearchTree', () => {
  it('returns matching directory nodes when searching by name', () => {
    const result = buildSearchTree(files, '/workspace', 'components', 'name');
    const root = result.tree[0];
    const src = root?.children?.find((node) => node.name === 'src');
    const components = src?.children?.find((node) => node.name === 'components');

    expect(components?.isDir).toBe(true);
    expect(components?.searchMatchKind).toBe('name');
    expect(components?.children?.map((node) => node.name)).toEqual(['Button.tsx']);
    expect(result.expandedKeys).toEqual(expect.arrayContaining(['', 'src', 'src/components']));
  });

  it('includes content matches and their content counts', () => {
    const result = buildSearchTree(
      files,
      '/workspace',
      'needle',
      'content',
      new Map([['/workspace/docs/guide.md', 2]])
    );
    const guide = result.tree[0]?.children?.find((node) => node.name === 'docs')?.children?.[0];

    expect(guide?.name).toBe('guide.md');
    expect(guide?.searchMatchKind).toBe('content');
    expect(guide?.searchContentMatchCount).toBe(2);
  });
});
