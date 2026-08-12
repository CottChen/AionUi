/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Empty, Spin } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const CSV_PREVIEW_MAX_ROWS = 1000;
export const CSV_PREVIEW_MAX_COLUMNS = 100;

export type CsvPreviewGrid = {
  rows: string[][];
  columnCount: number;
  truncatedRows: boolean;
  truncatedColumns: boolean;
};

const columnLabel = (index: number): string => {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

export const parseCsvPreview = async (content: string): Promise<CsvPreviewGrid> => {
  if (!content.trim()) {
    return { rows: [], columnCount: 0, truncatedRows: false, truncatedColumns: false };
  }

  const XLSX = await import('xlsx-republish');
  const workbook = XLSX.read(content, {
    type: 'string',
    raw: true,
    sheetRows: CSV_PREVIEW_MAX_ROWS + 1,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], columnCount: 0, truncatedRows: false, truncatedColumns: false };
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
  const truncatedRows = rawRows.length > CSV_PREVIEW_MAX_ROWS;
  const visibleRows = rawRows.slice(0, CSV_PREVIEW_MAX_ROWS);
  const widestRow = visibleRows.reduce((width, row) => Math.max(width, row.length), 0);
  const columnCount = Math.min(widestRow, CSV_PREVIEW_MAX_COLUMNS);

  return {
    rows: visibleRows.map((row) => row.slice(0, CSV_PREVIEW_MAX_COLUMNS).map((cell) => String(cell ?? ''))),
    columnCount,
    truncatedRows,
    truncatedColumns: widestRow > CSV_PREVIEW_MAX_COLUMNS,
  };
};

type CsvTableRendererProps = {
  content: string;
};

const CsvTableRenderer: React.FC<CsvTableRendererProps> = ({ content }) => {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<CsvPreviewGrid>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setGrid(undefined);
    setFailed(false);

    void parseCsvPreview(content)
      .then((nextGrid) => {
        if (active) setGrid(nextGrid);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [content]);

  if (failed) {
    return (
      <div className='h-full flex items-center justify-center px-20px'>
        <Empty description={t('preview.excel.loadFailed')} />
      </div>
    );
  }

  if (!grid) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Spin dot />
      </div>
    );
  }

  if (grid.rows.length === 0 || grid.columnCount === 0) {
    return (
      <div className='h-full flex items-center justify-center px-20px'>
        <Empty description={t('preview.excel.emptySheet')} />
      </div>
    );
  }

  const truncated = grid.truncatedRows || grid.truncatedColumns;
  const minWidth = Math.max(320, 48 + grid.columnCount * 120);

  return (
    <div className='h-full min-h-0 flex flex-col bg-1'>
      {truncated ? (
        <div className='shrink-0 border-b border-border-2 bg-bg-2 px-12px py-7px text-11px text-t-secondary'>
          {t('preview.csv.truncated', { rows: CSV_PREVIEW_MAX_ROWS, columns: CSV_PREVIEW_MAX_COLUMNS })}
        </div>
      ) : null}
      <div className='min-h-0 flex-1 overflow-auto overscroll-contain touch-pan-x touch-pan-y'>
        <table className='border-separate border-spacing-0 text-12px text-t-primary' style={{ minWidth }}>
          <thead>
            <tr>
              <th className='sticky left-0 top-0 z-3 h-28px w-48px border-b border-r border-border-2 bg-bg-2' />
              {Array.from({ length: grid.columnCount }, (_, columnIndex) => (
                <th
                  key={columnIndex}
                  className='sticky top-0 z-2 h-28px min-w-120px border-b border-r border-border-2 bg-bg-2 px-8px text-center font-600 text-t-secondary'
                >
                  {columnLabel(columnIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className='sticky left-0 z-1 h-28px w-48px border-b border-r border-border-2 bg-bg-2 px-6px text-center font-500 text-t-tertiary'>
                  {rowIndex + 1}
                </th>
                {Array.from({ length: grid.columnCount }, (_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className='h-28px max-w-320px min-w-120px border-b border-r border-border-2 bg-1 px-8px whitespace-nowrap overflow-hidden text-ellipsis'
                    title={row[columnIndex] || undefined}
                  >
                    {row[columnIndex]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CsvTableRenderer;
