/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { injectHashAnchorNavigationGuard } from '@/renderer/pages/conversation/Preview/components/renderers/htmlAnchorGuard';

describe('injectHashAnchorNavigationGuard', () => {
  it('injects the guard before body end', () => {
    const html = '<html><body><a href="#s2">S2</a><section id="s2"></section></body></html>';

    const result = injectHashAnchorNavigationGuard(html);

    expect(result).toContain('data-aionui-hash-anchor-guard="true"');
    expect(result.indexOf('data-aionui-hash-anchor-guard')).toBeLessThan(result.indexOf('</body>'));
  });

  it('intercepts only same-document hash anchors', () => {
    const result = injectHashAnchorNavigationGuard('<body><a href="#s2"><span>go</span></a></body>');

    expect(result).toContain("rawHref.charAt(0) !== '#'");
    expect(result).toContain('event.preventDefault()');
    expect(result).toContain('scrollIntoView()');
    expect(result).not.toContain('pushState');
  });

  it('does not inject twice', () => {
    const once = injectHashAnchorNavigationGuard('<body><a href="#s2">S2</a></body>');
    const twice = injectHashAnchorNavigationGuard(once);

    expect(twice).toBe(once);
  });
});
