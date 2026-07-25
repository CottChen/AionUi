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

const stripLocalFileReferenceWrappers = (value: string): string => {
  let normalized = value.trim();

  for (let index = 0; index < 3; index += 1) {
    const innerParenthesized =
      (normalized.startsWith('(') && normalized.endsWith(')')) ||
      (normalized.startsWith('（') && normalized.endsWith('）'));
    if (innerParenthesized) {
      const inner = normalized.slice(1, -1).trim();
      if (inner.startsWith('<') && inner.endsWith('>')) {
        normalized = inner;
        continue;
      }
    }

    if (normalized.startsWith('<') && normalized.endsWith('>')) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }

    break;
  }

  return normalized;
};

export type LocalFileLinkReference = {
  filePath: string;
  rawReference: string;
  line?: number;
  column?: number;
  endLine?: number;
};

type LocalFileLocation = {
  line?: number;
  column?: number;
  endLine?: number;
  source?: 'hash' | 'colon';
};

type LocalFilePathCandidate = {
  filePath: string;
  hashLocation?: LocalFileLocation;
  hasInvalidHash?: boolean;
};

type ResolveLocalFileLinkOptions = {
  baseDir?: string;
  allowedRootDir?: string;
};

const parseHashLocation = (hash: string): LocalFileLocation | null => {
  const match = /^#L(\d+)(?:-L(\d+))?$/.exec(hash);
  if (!match) return null;

  const [, lineText, endLineText] = match;
  return {
    line: Number(lineText),
    endLine: endLineText == null ? undefined : Number(endLineText),
    source: 'hash',
  };
};

const isLineLocationLikeHash = (hash: string): boolean => /^#[Ll]/.test(hash);

const splitHashLocation = (href: string): LocalFilePathCandidate => {
  const hashIndex = href.indexOf('#');
  if (hashIndex < 0) return { filePath: href };

  const hashLocation = parseHashLocation(href.slice(hashIndex));
  if (!hashLocation) {
    return {
      filePath: href.slice(0, hashIndex),
      hasInvalidHash: isLineLocationLikeHash(href.slice(hashIndex)),
    };
  }

  return {
    filePath: href.slice(0, hashIndex),
    hashLocation,
  };
};

const normalizeFilePath = (path: string): string => {
  return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
};

const isAbsoluteLocalFilePath = (path: string): boolean => {
  return (
    /^[A-Za-z]:[\\/]/.test(path) || /^\/[A-Za-z]:[\\/]/.test(path) || path.startsWith('//') || path.startsWith('/')
  );
};

const joinLocalPath = (baseDir: string, relativePath: string): string => {
  const normalizedBase = baseDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
  const joined = `${normalizedBase}/${normalizedRelative}`;
  const prefix = /^[A-Za-z]:\//.test(joined) ? joined.slice(0, 3) : joined.startsWith('/') ? '/' : '';
  const rest = prefix ? joined.slice(prefix.length) : joined;
  const parts: string[] = [];

  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return `${prefix}${parts.join('/')}`;
};

const normalizeComparablePath = (path: string): string => {
  const normalized = normalizeFilePath(path.replace(/\\/g, '/')).replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
};

const isPathWithinRoot = (path: string, rootDir?: string): boolean => {
  if (!rootDir) return true;

  const normalizedPath = normalizeComparablePath(path);
  const normalizedRoot = normalizeComparablePath(rootDir);
  if (!normalizedRoot) return true;

  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};

const isRelativeLocalHref = (href: string): boolean => {
  if (!href || href.startsWith('#') || href.startsWith('?')) return false;
  if (/^(https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(href)) return false;
  if (/^file:/i.test(href)) return false;
  return !isAbsoluteLocalFilePath(href);
};

const normalizeLocalFileHrefToPath = (
  href: string,
  options?: ResolveLocalFileLinkOptions
): LocalFilePathCandidate | null => {
  if (/^https?:\/\//i.test(href)) return null;

  if (/^file:/i.test(href)) {
    try {
      const url = new URL(href);
      const path = normalizeFilePath(safeDecodeURIComponent(url.pathname));
      const rawHash = safeDecodeURIComponent(url.hash);
      if (!rawHash) return { filePath: path };

      const hashLocation = parseHashLocation(rawHash);
      return hashLocation
        ? { filePath: path, hashLocation }
        : { filePath: path, hasInvalidHash: isLineLocationLikeHash(rawHash) };
    } catch {
      const stripped = href.replace(/^file:(?:\/\/)?/i, '');
      const candidate = splitHashLocation(stripped);
      return {
        ...candidate,
        filePath: normalizeFilePath(candidate.filePath),
      };
    }
  }

  const candidate = splitHashLocation(href);
  let path = candidate.filePath;
  let resolvedRelativePath = false;

  if (options?.baseDir && isRelativeLocalHref(path)) {
    path = joinLocalPath(options.baseDir, path);
    if (!isPathWithinRoot(path, options.allowedRootDir)) return null;
    resolvedRelativePath = true;
  }

  if (/^[A-Za-z]:[\\/]/.test(path)) {
    return {
      ...candidate,
      filePath: path,
    };
  }

  if (/^\/[A-Za-z]:[\\/]/.test(path)) {
    return {
      ...candidate,
      filePath: path.slice(1),
    };
  }

  if (resolvedRelativePath) return { ...candidate, filePath: path };
  if (options?.allowedRootDir && isPathWithinRoot(path, options.allowedRootDir))
    return { ...candidate, filePath: path };
  if (/^\/(Users|home|tmp|private|var|mnt|Volumes)\//.test(path)) return { ...candidate, filePath: path };
  if (/^\/[^/?#]+\/.+\.[^/?#/.]+$/.test(path)) return { ...candidate, filePath: path };

  return null;
};

const splitLocationSuffix = (
  filePath: string,
  options?: ResolveLocalFileLinkOptions
): Omit<LocalFileLinkReference, 'rawReference'> & LocalFileLocation => {
  const lineColumnMatch = /^(.*):(\d+):(\d+)$/.exec(filePath);
  if (lineColumnMatch) {
    const [, pathWithoutLocation, lineText, columnText] = lineColumnMatch;
    if (normalizeLocalFileHrefToPath(pathWithoutLocation, options)) {
      return {
        filePath: pathWithoutLocation,
        line: Number(lineText),
        column: Number(columnText),
        source: 'colon',
      };
    }
  }

  const lineMatch = /^(.*):(\d+)$/.exec(filePath);
  if (!lineMatch) return { filePath };

  const [, pathWithoutLocation, lineText] = lineMatch;
  if (!normalizeLocalFileHrefToPath(pathWithoutLocation, options)) return { filePath };

  return {
    filePath: pathWithoutLocation,
    line: Number(lineText),
    source: 'colon',
  };
};

const formatRawReference = (
  reference: Omit<LocalFileLinkReference, 'rawReference'>,
  source?: 'hash' | 'colon'
): string => {
  if (reference.line == null) return reference.filePath;

  if (source === 'hash') {
    return `${reference.filePath}#L${reference.line}${reference.endLine == null ? '' : `-L${reference.endLine}`}`;
  }

  return `${reference.filePath}:${reference.line}${reference.column == null ? '' : `:${reference.column}`}`;
};

export const resolveLocalFileLinkReference = (
  rawHref: string,
  resolvedHref?: string,
  options?: ResolveLocalFileLinkOptions
): LocalFileLinkReference | null => {
  const href = stripLocalFileReferenceWrappers(safeDecodeURIComponent((rawHref || resolvedHref || '').trim()));
  if (!href) return null;

  const candidate = normalizeLocalFileHrefToPath(href, options);
  if (!candidate || candidate.hasInvalidHash) return null;

  const colonReference = splitLocationSuffix(candidate.filePath, options);
  const reference =
    candidate.hashLocation?.line == null
      ? colonReference
      : {
          ...candidate.hashLocation,
          filePath: colonReference.filePath,
        };

  if (!normalizeLocalFileHrefToPath(reference.filePath, options)) return null;

  const source = candidate.hashLocation?.line == null ? colonReference.source : 'hash';
  const { source: _source, ...publicReference } = reference;
  return {
    ...publicReference,
    rawReference: formatRawReference(publicReference, source),
  };
};

export const resolveLocalFileLinkPath = (
  rawHref: string,
  resolvedHref?: string,
  options?: ResolveLocalFileLinkOptions
): string | null => {
  return resolveLocalFileLinkReference(rawHref, resolvedHref, options)?.filePath ?? null;
};

export const toLocalFileHref = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const withScheme = /^[A-Za-z]:\//.test(normalized) ? `file:///${normalized}` : `file://${normalized}`;
  return encodeURI(withScheme);
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
