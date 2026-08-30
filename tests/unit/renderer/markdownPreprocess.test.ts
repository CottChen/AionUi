/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { transformMarkdownWikiLinks } from '@/renderer/components/Markdown/markdownPreprocess';

describe('transformMarkdownWikiLinks', () => {
  it('converts wiki links and preserves their labels', () => {
    expect(transformMarkdownWikiLinks('[[docs/foo]] [[guide|Guide]]')).toBe('[docs/foo](<docs/foo>) [Guide](<guide>)');
  });

  it('does not transform wiki links inside code', () => {
    expect(transformMarkdownWikiLinks('`[[inline]]`\n```md\n[[fenced]]\n```\n[[open]]')).toBe(
      '`[[inline]]`\n```md\n[[fenced]]\n```\n[open](<open>)'
    );
  });
});
