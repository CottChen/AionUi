import { describe, expect, it } from 'vitest';

import {
  CSV_PREVIEW_MAX_COLUMNS,
  CSV_PREVIEW_MAX_ROWS,
  parseCsvPreview,
} from '@/renderer/pages/conversation/Preview/components/renderers/CsvTableRenderer';

describe('CSV table preview parsing', () => {
  it('preserves quoted commas, escaped quotes, and line breaks', async () => {
    const grid = await parseCsvPreview('name,note\nAlice,"hello, world"\nBob,"line 1\nline 2"\nEve,"a ""quote"""');

    expect(grid.rows).toEqual([
      ['name', 'note'],
      ['Alice', 'hello, world'],
      ['Bob', 'line 1\nline 2'],
      ['Eve', 'a "quote"'],
    ]);
  });

  it('returns an empty grid for an empty source file', async () => {
    await expect(parseCsvPreview(' \n')).resolves.toEqual({
      rows: [],
      columnCount: 0,
      truncatedRows: false,
      truncatedColumns: false,
    });
  });

  it('bounds rendered rows and columns for mobile responsiveness', async () => {
    const wideRow = Array.from({ length: CSV_PREVIEW_MAX_COLUMNS + 1 }, (_, index) => `c${index}`).join(',');
    const content = Array.from({ length: CSV_PREVIEW_MAX_ROWS + 1 }, () => wideRow).join('\n');
    const grid = await parseCsvPreview(content);

    expect(grid.rows).toHaveLength(CSV_PREVIEW_MAX_ROWS);
    expect(grid.columnCount).toBe(CSV_PREVIEW_MAX_COLUMNS);
    expect(grid.truncatedRows).toBe(true);
    expect(grid.truncatedColumns).toBe(true);
  });
});
