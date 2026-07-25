/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  resolveLocalFileLinkPath,
  resolveLocalFileLinkReference,
  toLocalFileHref,
} from '@/renderer/components/Markdown/markdownUtils';

describe('resolveLocalFileLinkPath', () => {
  it('recognizes Windows absolute paths emitted as root-relative markdown links', () => {
    expect(resolveLocalFileLinkPath('/C:/Users/Administrator/AppData/Roaming/AionUi/report.xlsx')).toBe(
      'C:/Users/Administrator/AppData/Roaming/AionUi/report.xlsx'
    );
  });

  it('recognizes encoded file URLs', () => {
    expect(resolveLocalFileLinkPath('file:///C:/Users/Administrator/%E7%9C%8B%E6%9D%BF.xlsx')).toBe(
      'C:/Users/Administrator/看板.xlsx'
    );
  });

  it('recognizes common POSIX absolute paths', () => {
    expect(resolveLocalFileLinkPath('/Users/demo/outputs/report.xlsx')).toBe('/Users/demo/outputs/report.xlsx');
  });

  it('recognizes file-like POSIX absolute paths outside common home and temp roots', () => {
    expect(resolveLocalFileLinkPath('/opt/aionui/outputs/report.xlsx')).toBe('/opt/aionui/outputs/report.xlsx');
  });

  it('recognizes line suffixes without confusing Windows drive letters', () => {
    const reference = resolveLocalFileLinkReference('C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log:1421');

    expect(reference).toEqual({
      filePath: 'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log',
      rawReference: 'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log:1421',
      line: 1421,
    });
    expect(resolveLocalFileLinkPath('C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log:1421')).toBe(
      'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log'
    );
  });

  it('recognizes line and column suffixes without including the line in the file path', () => {
    const reference = resolveLocalFileLinkReference(
      'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log:1421:7'
    );

    expect(reference).toEqual({
      filePath: 'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log',
      rawReference: 'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log:1421:7',
      line: 1421,
      column: 7,
    });
    expect(resolveLocalFileLinkPath('C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log:1421:7')).toBe(
      'C:/Users/Administrator/AppData/Roaming/AionUi/logs/app.log'
    );
  });

  it('recognizes POSIX hash line references', () => {
    expect(resolveLocalFileLinkReference('/Users/demo/file.ts#L10')).toEqual({
      filePath: '/Users/demo/file.ts',
      rawReference: '/Users/demo/file.ts#L10',
      line: 10,
    });

    expect(resolveLocalFileLinkReference('/Users/demo/file.ts#L10-L20')).toEqual({
      filePath: '/Users/demo/file.ts',
      rawReference: '/Users/demo/file.ts#L10-L20',
      line: 10,
      endLine: 20,
    });
  });

  it('recognizes file URL hash line references and normalizes raw references', () => {
    expect(resolveLocalFileLinkReference('file:///Users/demo/file.ts#L10')).toEqual({
      filePath: '/Users/demo/file.ts',
      rawReference: '/Users/demo/file.ts#L10',
      line: 10,
    });

    expect(resolveLocalFileLinkReference('file:///Users/demo/file.ts#L10-L20')).toEqual({
      filePath: '/Users/demo/file.ts',
      rawReference: '/Users/demo/file.ts#L10-L20',
      line: 10,
      endLine: 20,
    });

    expect(resolveLocalFileLinkReference('file:///Users/demo/My%20File.ts#L10')).toEqual({
      filePath: '/Users/demo/My File.ts',
      rawReference: '/Users/demo/My File.ts#L10',
      line: 10,
    });

    expect(resolveLocalFileLinkReference('file:///Users/demo/%E6%96%87%E4%BB%B6.ts#L10')).toEqual({
      filePath: '/Users/demo/文件.ts',
      rawReference: '/Users/demo/文件.ts#L10',
      line: 10,
    });
  });

  it('recognizes Windows file URL hash lines and ranges', () => {
    expect(resolveLocalFileLinkReference('file:///C:/Users/demo/file.ts#L10')).toEqual({
      filePath: 'C:/Users/demo/file.ts',
      rawReference: 'C:/Users/demo/file.ts#L10',
      line: 10,
    });

    expect(resolveLocalFileLinkReference('file:///C:/Users/demo/file.ts#L10-L20')).toEqual({
      filePath: 'C:/Users/demo/file.ts',
      rawReference: 'C:/Users/demo/file.ts#L10-L20',
      line: 10,
      endLine: 20,
    });
  });

  it('prioritizes hash line references over colon suffixes', () => {
    expect(resolveLocalFileLinkReference('/Users/demo/file.ts:10#L20')).toEqual({
      filePath: '/Users/demo/file.ts',
      rawReference: '/Users/demo/file.ts#L20',
      line: 20,
    });
  });

  it('unwraps angle-bracket local references wrapped in markdown punctuation', () => {
    expect(resolveLocalFileLinkReference('(</Users/demo/project/docs/架构说明.md:39>)')).toEqual({
      filePath: '/Users/demo/project/docs/架构说明.md',
      rawReference: '/Users/demo/project/docs/架构说明.md:39',
      line: 39,
    });

    expect(
      resolveLocalFileLinkReference(
        '(</home/ecs-user/projects/ainda-kb/sources/A/processed/爱宁达-吡美莫司乳膏说明书-20260101.md:39>)',
        undefined,
        { baseDir: '/home/ecs-user/projects/ainda-kb' }
      )
    ).toEqual({
      filePath: '/home/ecs-user/projects/ainda-kb/sources/A/processed/爱宁达-吡美莫司乳膏说明书-20260101.md',
      rawReference: '/home/ecs-user/projects/ainda-kb/sources/A/processed/爱宁达-吡美莫司乳膏说明书-20260101.md:39',
      line: 39,
    });
  });

  it('rejects unsupported hash line formats and remote hash links', () => {
    expect(resolveLocalFileLinkReference('user.ts')).toBeNull();
    expect(resolveLocalFileLinkReference('./user.ts')).toBeNull();
    expect(resolveLocalFileLinkReference('../user.ts')).toBeNull();
    expect(resolveLocalFileLinkReference('/settings')).toBeNull();
    expect(resolveLocalFileLinkReference('https://aionui.com/docs#L10')).toBeNull();
    expect(resolveLocalFileLinkReference('https://github.com/org/repo/blob/main/file.ts#L10')).toBeNull();
    expect(resolveLocalFileLinkReference('/Users/demo/file.ts#l10')).toBeNull();
    expect(resolveLocalFileLinkReference('/Users/demo/file.ts#L10-l20')).toBeNull();
  });

  it('ignores non-line local hash anchors and resolves the file itself', () => {
    expect(resolveLocalFileLinkReference('/Users/demo/docs/source.md#page-1')).toEqual({
      filePath: '/Users/demo/docs/source.md',
      rawReference: '/Users/demo/docs/source.md',
    });

    expect(
      resolveLocalFileLinkReference('../../documents/source.md#page-1', undefined, {
        baseDir: '/Users/demo/project/sources/A',
        allowedRootDir: '/Users/demo/project',
      })
    ).toEqual({
      filePath: '/Users/demo/project/documents/source.md',
      rawReference: '/Users/demo/project/documents/source.md',
    });
  });

  it('resolves workspace-relative links only when a base directory is provided', () => {
    expect(resolveLocalFileLinkReference('docs/foo.ts#L12')).toBeNull();

    expect(resolveLocalFileLinkReference('docs/foo.ts#L12', undefined, { baseDir: '/Users/demo/project' })).toEqual({
      filePath: '/Users/demo/project/docs/foo.ts',
      rawReference: '/Users/demo/project/docs/foo.ts#L12',
      line: 12,
    });

    expect(resolveLocalFileLinkReference('./docs/foo.ts:12:3', undefined, { baseDir: '/Users/demo/project' })).toEqual({
      filePath: '/Users/demo/project/docs/foo.ts',
      rawReference: '/Users/demo/project/docs/foo.ts:12:3',
      line: 12,
      column: 3,
    });

    expect(
      resolveLocalFileLinkReference('architecture/ARCHITECTURE.md', undefined, {
        baseDir: '/Users/demo/project',
      })
    ).toEqual({
      filePath: '/Users/demo/project/architecture/ARCHITECTURE.md',
      rawReference: '/Users/demo/project/architecture/ARCHITECTURE.md',
    });
  });

  it('resolves dot-segment relative links only when they stay within the allowed root', () => {
    expect(
      resolveLocalFileLinkReference('../src/foo.ts#L7', undefined, {
        baseDir: '/Users/demo/project/docs',
        allowedRootDir: '/Users/demo/project',
      })
    ).toEqual({
      filePath: '/Users/demo/project/src/foo.ts',
      rawReference: '/Users/demo/project/src/foo.ts#L7',
      line: 7,
    });

    expect(
      resolveLocalFileLinkReference('../../outside.ts#L1', undefined, {
        baseDir: '/Users/demo/project/docs',
        allowedRootDir: '/Users/demo/project',
      })
    ).toBeNull();
  });

  it('resolves relative directory links even when the target has no file extension', () => {
    expect(
      resolveLocalFileLinkReference('docs', undefined, {
        baseDir: '/workspace/demo',
        allowedRootDir: '/workspace/demo',
      })
    ).toEqual({
      filePath: '/workspace/demo/docs',
      rawReference: '/workspace/demo/docs',
    });
  });

  it('does not treat normal web links or app routes as local files', () => {
    expect(resolveLocalFileLinkPath('https://aionui.com/docs')).toBeNull();
    expect(resolveLocalFileLinkPath('/settings')).toBeNull();
  });

  it('formats local file paths as file URLs for browser link copying', () => {
    expect(toLocalFileHref('C:/Users/Administrator/AppData/Roaming/AionUi/report.xlsx')).toBe(
      'file:///C:/Users/Administrator/AppData/Roaming/AionUi/report.xlsx'
    );
    expect(toLocalFileHref('/var/folders/demo/report.xlsx')).toBe('file:///var/folders/demo/report.xlsx');
  });
});
