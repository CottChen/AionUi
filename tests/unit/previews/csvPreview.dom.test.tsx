import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PreviewToolbar from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar';
import CsvTableRenderer from '@/renderer/pages/conversation/Preview/components/renderers/CsvTableRenderer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderCsvToolbar = (onViewModeChange = vi.fn()) =>
  render(
    <PreviewToolbar
      content_type='csv'
      isMarkdown={false}
      isHTML={false}
      viewMode='preview'
      isSplitScreenEnabled={false}
      showOpenInSystemButton={false}
      showRevealInWorkspaceButton={false}
      hasFilePath={false}
      onViewModeChange={onViewModeChange}
      onSplitScreenToggle={vi.fn()}
      onOpenInSystem={vi.fn()}
      onRevealInWorkspace={vi.fn()}
      onDownload={vi.fn()}
      onClose={vi.fn()}
    />
  );

describe('CSV source and table preview', () => {
  it('offers source and preview modes without a split-screen action', () => {
    const onViewModeChange = vi.fn();
    renderCsvToolbar(onViewModeChange);

    fireEvent.click(screen.getByText('preview.source'));
    fireEvent.click(screen.getByText('preview.preview'));

    expect(onViewModeChange).toHaveBeenNthCalledWith(1, 'source');
    expect(onViewModeChange).toHaveBeenNthCalledWith(2, 'preview');
    expect(screen.queryByTitle('preview.openSplitScreen')).not.toBeInTheDocument();
  });

  it('renders parsed CSV cells as a spreadsheet table', async () => {
    render(<CsvTableRenderer content={'name,note\nAlice,"hello, world"'} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('hello, world')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
