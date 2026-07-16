/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  splitMarkdownFrontmatter,
  transformMarkdownWikiLinks,
} from '@/renderer/components/Markdown/markdownPreprocess';

describe('transformMarkdownWikiLinks', () => {
  it('converts wiki links to markdown links', () => {
    expect(transformMarkdownWikiLinks('[[docs/foo]] [[2020-8fe4e0ee|中国特应性皮炎诊疗指南]]')).toBe(
      '[docs/foo](<docs/foo>) [中国特应性皮炎诊疗指南](<2020-8fe4e0ee>)'
    );
  });

  it('keeps heading wiki link labels but opens the target document', () => {
    expect(transformMarkdownWikiLinks('[[xxx#章节]]')).toBe('[xxx#章节](<xxx>)');
  });

  it('does not convert wiki links inside inline or fenced code', () => {
    expect(transformMarkdownWikiLinks('`[[docs/foo]]`\n\n```md\n[[docs/bar]]\n```\n[[docs/baz]]')).toBe(
      '`[[docs/foo]]`\n\n```md\n[[docs/bar]]\n```\n[docs/baz](<docs/baz>)'
    );
  });

  it('requires closing fences to be at least as long as opening fences', () => {
    expect(transformMarkdownWikiLinks('````md\n[[docs/foo]]\n```\n[[docs/bar]]\n````\n[[docs/baz]]')).toBe(
      '````md\n[[docs/foo]]\n```\n[[docs/bar]]\n````\n[docs/baz](<docs/baz>)'
    );
  });
});

describe('splitMarkdownFrontmatter', () => {
  it('extracts YAML frontmatter from the start of markdown content', () => {
    expect(splitMarkdownFrontmatter('---\nschema_version: ainda-kb/source/v1\ntype: source\n---\n# Body')).toEqual({
      metadata: 'schema_version: ainda-kb/source/v1\ntype: source',
      body: '# Body',
    });
  });

  it('ignores delimiter blocks that are not at the start', () => {
    expect(splitMarkdownFrontmatter('# Body\n---\ntype: source\n---')).toBeNull();
  });
});
