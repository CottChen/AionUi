/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';

import { diffColors } from '@/renderer/styles/colors';

/**
 * Format raw code string, attempting JSON pretty-print.
 * Falls back to stripped trailing newline if parsing fails.
 */
export const formatCode = (code: string): string => {
  const content = String(code).replace(/\n$/, '');
  try {
    return JSON.stringify(
      JSON.parse(content),
      (_key, value) => {
        return value;
      },
      2
    );
  } catch (_error) {
    return content;
  }
};

/**
 * Conditional render helper — returns trueComponent when condition is true,
 * falseComponent otherwise.
 */
export const logicRender = <T, F>(condition: boolean, trueComponent: T, falseComponent?: F): T | F => {
  return condition ? trueComponent : (falseComponent as F);
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const resolveLocalFileLinkPath = (rawHref: string, resolvedHref?: string): string | null => {
  const href = safeDecodeURIComponent((rawHref || resolvedHref || '').trim());
  if (!href) return null;

  if (/^file:/i.test(href)) {
    try {
      const url = new URL(href);
      const path = safeDecodeURIComponent(url.pathname);
      return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
    } catch {
      const path = href.replace(/^file:\/+/i, '');
      return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
    }
  }

  if (/^[A-Za-z]:[\\/]/.test(href)) return href;
  if (/^\/[A-Za-z]:[\\/]/.test(href)) return href.slice(1);

  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      const path = safeDecodeURIComponent(url.pathname);
      return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : null;
    } catch {
      return null;
    }
  }

  if (/^\/(Users|home|tmp|private|var|mnt|Volumes)\//.test(href)) return href;

  return null;
};

/**
 * Get line background style for diff rendering.
 * Highlights additions (green), deletions (red), and hunk headers (blue).
 */
export const getDiffLineStyle = (line: string, isDark: boolean): React.CSSProperties => {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return { backgroundColor: isDark ? diffColors.additionBgDark : diffColors.additionBgLight };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return { backgroundColor: isDark ? diffColors.deletionBgDark : diffColors.deletionBgLight };
  }
  if (line.startsWith('@@')) {
    return { backgroundColor: isDark ? diffColors.hunkBgDark : diffColors.hunkBgLight };
  }
  return {};
};
