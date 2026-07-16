/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type MarkdownFrontmatter = {
  metadata: string;
  body: string;
};

const FENCE_PATTERN = /^(\s*)(`{3,}|~{3,})/;

const escapeMarkdownLinkLabel = (value: string): string => value.replace(/([\\\]])/g, '\\$1');

const escapeMarkdownLinkDestination = (value: string): string => value.replace(/[\r\n]/g, ' ').replace(/>/g, '%3E');

const stripWikiHeadingFromTarget = (target: string): string => {
  const hashIndex = target.indexOf('#');
  if (hashIndex < 0) return target;
  const hash = target.slice(hashIndex);
  return /^#L\d+(?:-L\d+)?$/.test(hash) ? target : target.slice(0, hashIndex);
};

const replaceWikiLinksInText = (text: string): string => {
  return text.replace(/\[\[([^\]\n]+?)\]\]/g, (match, rawContent: string) => {
    const [rawTarget, ...rawLabelParts] = rawContent.split('|');
    const target = rawTarget.trim();
    if (!target) return match;

    const linkTarget = stripWikiHeadingFromTarget(target);
    if (!linkTarget) return match;

    const label = (rawLabelParts.length ? rawLabelParts.join('|').trim() : target) || target;
    return `[${escapeMarkdownLinkLabel(label)}](<${escapeMarkdownLinkDestination(linkTarget)}>)`;
  });
};

const replaceWikiLinksOutsideInlineCode = (line: string): string => {
  const parts = line.split(/(`+)/);
  let inCode = false;
  let result = '';

  for (const part of parts) {
    if (/^`+$/.test(part)) {
      inCode = !inCode;
      result += part;
    } else {
      result += inCode ? part : replaceWikiLinksInText(part);
    }
  }

  return result;
};

export const transformMarkdownWikiLinks = (markdown: string): string => {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  return lines
    .map((line) => {
      const fenceMatch = FENCE_PATTERN.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[2];
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
          inFence = false;
          fenceMarker = '';
        }
        return line;
      }

      return inFence ? line : replaceWikiLinksOutsideInlineCode(line);
    })
    .join('\n');
};

export const splitMarkdownFrontmatter = (markdown: string): MarkdownFrontmatter | null => {
  const match = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(markdown);
  if (!match) return null;

  return {
    metadata: match[1],
    body: match[2],
  };
};
