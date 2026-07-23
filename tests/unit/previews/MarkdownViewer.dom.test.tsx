/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const previewMocks = vi.hoisted(() => ({
  openPreview: vi.fn(),
}));
const copyTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      fetchRemoteImage: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  joinPath: (base: string, rel: string) => `${base}/${rel}`,
}));

vi.mock('@/renderer/hooks/chat/useAutoScroll', () => ({
  useAutoScroll: () => {},
}));

vi.mock('@/renderer/hooks/ui/useTextSelection', () => ({
  useTextSelection: () => ({ selectedText: '', selectionPosition: null, clearSelection: vi.fn() }),
}));

vi.mock('@/renderer/hooks/chat/useTypingAnimation', () => ({
  useTypingAnimation: ({ content }: { content: string }) => ({
    displayedContent: content,
    isAnimating: false,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: copyTextMock,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    openPreview: previewMocks.openPreview,
  }),
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor', () => ({
  default: () => <div data-testid='markdown-editor' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/renderers/SelectionToolbar', () => ({
  default: () => <div data-testid='selection-toolbar' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/hooks/useScrollSyncHelpers', () => ({
  useContainerScroll: vi.fn(),
  useContainerScrollTarget: vi.fn(),
}));

vi.mock('@/renderer/components/Markdown/MermaidBlock', () => ({
  default: () => <div data-testid='mermaid-block' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Message: {
    error: vi.fn(),
  },
  Collapse: Object.assign(
    ({ children, defaultActiveKey = [] }: { children?: React.ReactNode; defaultActiveKey?: string[] }) => {
      const activeKeys = new Set(defaultActiveKey);
      return (
        <div data-testid='collapse'>
          {React.Children.map(children, (child) => {
            if (!React.isValidElement<{ name: string; header: React.ReactNode; children?: React.ReactNode }>(child)) {
              return child;
            }
            const { name, header, children: itemChildren } = child.props;
            const expanded = activeKeys.has(name);
            return (
              <section data-testid={`collapse-item-${name}`} data-expanded={expanded}>
                <div>{header}</div>
                {expanded && <div>{itemChildren}</div>}
              </section>
            );
          })}
        </div>
      );
    },
    {
      Item: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    }
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

import MarkdownViewer from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';
import { ipcBridge } from '@/common';
import { WORKSPACE_REVEAL_FILE_EVENT } from '@/renderer/utils/workspace/workspaceEvents';

const fileMetadata = (path: string) => ({
  name: path.split(/[\\/]/).pop() || path,
  path,
  size: 128,
  type: 'file',
  lastModified: 1_717_000_000,
});

describe('MarkdownViewer', () => {
  beforeEach(() => {
    previewMocks.openPreview.mockClear();
    copyTextMock.mockClear();
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockReset();
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockReset();
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
    vi.mocked(ipcBridge.fs.fetchRemoteImage.invoke).mockReset();
  });

  it('renders markdown content in preview mode', () => {
    render(<MarkdownViewer content='# Hello World' />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders MarkdownEditor in source mode', () => {
    render(<MarkdownViewer content='# Test' viewMode='source' />);
    expect(screen.getByTestId('markdown-editor')).toBeInTheDocument();
  });

  it('hides toolbar when hideToolbar is true', () => {
    render(<MarkdownViewer content='# Test' hideToolbar />);
    expect(screen.queryByText('preview.preview')).not.toBeInTheDocument();
  });

  it('opens local file links in the preview panel instead of browser windows', async () => {
    const filePath = '/Users/demo/Desktop/chart.jpg';
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockResolvedValue('data:image/jpeg;base64,abc123');

    render(<MarkdownViewer content={`[image](${filePath})`} file_path='/Users/demo/Desktop/test.md' />);

    expect(screen.queryByRole('link', { name: 'image' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'image' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'data:image/jpeg;base64,abc123',
        'image',
        expect.objectContaining({
          file_name: 'chart.jpg',
          file_path: filePath,
          language: 'jpg',
          editable: false,
        }),
        { replace: false }
      );
    });
    expect(ipcBridge.fs.getImageBase64.invoke).toHaveBeenCalledWith({ path: filePath, workspace: undefined });
    expect(ipcBridge.fs.readFile.invoke).not.toHaveBeenCalled();
  });

  it('opens hash range local file links at the start line in preview mode', async () => {
    const filePath = '/Users/demo/Desktop/app.ts';
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('const value = 1;\n');

    render(<MarkdownViewer content={`[app.ts](${filePath}#L10-L20)`} file_path='/Users/demo/Desktop/test.md' />);

    expect(screen.queryByRole('link', { name: /app\.ts/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /app\.ts\s+L10-L20/ }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'const value = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'app.ts',
          file_path: filePath,
          language: 'ts',
          targetLine: 10,
          targetColumn: undefined,
          truncated: false,
        }),
        { replace: false }
      );
    });

    const metadata = previewMocks.openPreview.mock.calls[0]?.[2];
    expect(metadata).not.toHaveProperty('endLine');
    expect(metadata).not.toHaveProperty('targetEndLine');
  });

  it('opens encoded file URL hash links in preview mode', async () => {
    const filePath = '/Users/demo/Desktop/My File.ts';
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('const value = 1;\n');

    render(<MarkdownViewer content='[encoded file](file:///Users/demo/Desktop/My%20File.ts#L1)' />);

    expect(screen.queryByRole('link', { name: 'encoded file' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /encoded file\s+L1/ }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'const value = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'My File.ts',
          file_path: filePath,
          language: 'ts',
          targetLine: 1,
          targetColumn: undefined,
          truncated: false,
        }),
        { replace: false }
      );
    });
  });

  it('opens workspace-relative file links from markdown previews in a new preview tab', async () => {
    const filePath = '/Users/demo/project/src/foo.ts';
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('export const foo = 1;\n');

    render(
      <MarkdownViewer
        content='[foo](../src/foo.ts#L12)'
        file_path='/Users/demo/project/docs/README.md'
        workspace='/Users/demo/project'
      />
    );

    expect(screen.queryByRole('link', { name: /foo/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /foo\s+L12/ }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'export const foo = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'foo.ts',
          file_path: filePath,
          workspace: '/Users/demo/project',
          language: 'ts',
          targetLine: 12,
          targetColumn: undefined,
          truncated: false,
        }),
        { replace: false }
      );
    });

    expect(ipcBridge.fs.getFileMetadata.invoke).toHaveBeenCalledWith({
      path: filePath,
      workspace: '/Users/demo/project',
    });
  });

  it('opens parent-relative file links from markdown previews when workspace metadata is missing', async () => {
    const filePath = '/Users/demo/project/src/foo.ts';
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('export const foo = 1;\n');

    render(<MarkdownViewer content='[foo](../src/foo.ts#L12)' file_path='/Users/demo/project/docs/README.md' />);

    expect(screen.queryByRole('link', { name: /foo/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /foo\s+L12/ }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'export const foo = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'foo.ts',
          file_path: filePath,
          workspace: undefined,
          language: 'ts',
          targetLine: 12,
          targetColumn: undefined,
          truncated: false,
        }),
        { replace: false }
      );
    });

    expect(ipcBridge.fs.getFileMetadata.invoke).toHaveBeenCalledWith({
      path: filePath,
      workspace: undefined,
    });
  });

  it('opens workspace-relative markdown links without line numbers from markdown previews', async () => {
    const filePath = '/Users/demo/project/docs/architecture/ARCHITECTURE.md';
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('# Architecture\n');

    render(
      <MarkdownViewer
        content='[系统架构](architecture/ARCHITECTURE.md)'
        file_path='/Users/demo/project/docs/README.md'
        workspace='/Users/demo/project'
      />
    );

    expect(screen.queryByRole('link', { name: '系统架构' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '系统架构' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        '# Architecture\n',
        'markdown',
        expect.objectContaining({
          file_name: 'ARCHITECTURE.md',
          file_path: filePath,
          workspace: '/Users/demo/project',
          language: 'md',
          targetLine: undefined,
          targetColumn: undefined,
          editable: false,
        }),
        { replace: false }
      );
    });
  });

  it('opens wiki links in markdown previews and falls back to markdown files by stem', async () => {
    const stemPath = '/Users/demo/project/docs/2020-8fe4e0ee';
    const markdownPath = `${stemPath}.md`;
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fileMetadata(markdownPath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('# Guide\n');

    render(
      <MarkdownViewer
        content='[[2020-8fe4e0ee|中国特应性皮炎诊疗指南]]'
        file_path='/Users/demo/project/docs/README.md'
        workspace='/Users/demo/project'
      />
    );

    expect(screen.queryByRole('link', { name: '中国特应性皮炎诊疗指南' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '中国特应性皮炎诊疗指南' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        '# Guide\n',
        'markdown',
        expect.objectContaining({
          file_name: '2020-8fe4e0ee.md',
          file_path: markdownPath,
          workspace: '/Users/demo/project',
          language: 'md',
        }),
        { replace: false }
      );
    });
    expect(ipcBridge.fs.getFileMetadata.invoke).toHaveBeenNthCalledWith(1, {
      path: stemPath,
      workspace: '/Users/demo/project',
    });
    expect(ipcBridge.fs.getFileMetadata.invoke).toHaveBeenNthCalledWith(2, {
      path: markdownPath,
      workspace: '/Users/demo/project',
    });
  });

  it('renders leading YAML frontmatter as a collapsed metadata section', () => {
    const { container } = render(
      <MarkdownViewer content={'---\nschema_version: ainda-kb/source/v1\ntype: source\n---\n# Body'} />
    );

    const metadataPanel = container.querySelector('[data-testid="collapse-item-frontmatter"]');
    expect(metadataPanel).not.toBeNull();
    expect(metadataPanel).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByText('preview.frontmatterMetadata')).toBeInTheDocument();
    expect(screen.queryByText('schema_version: ainda-kb/source/v1')).not.toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('reveals workspace-relative directory links in the workspace tree instead of opening preview tabs', async () => {
    const directoryPath = '/Users/demo/project/docs';
    const revealEvents: Array<{ workspace?: string; filePath: string }> = [];
    const handleReveal = (event: Event) => {
      revealEvents.push((event as CustomEvent<{ workspace?: string; filePath: string }>).detail);
    };
    window.addEventListener(WORKSPACE_REVEAL_FILE_EVENT, handleReveal);
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue({
      ...fileMetadata(directoryPath),
      type: 'inode/directory',
      is_directory: true,
    });

    try {
      render(
        <MarkdownViewer
          content='[docs](docs)'
          file_path='/Users/demo/project/README.md'
          workspace='/Users/demo/project'
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'docs' }));

      await waitFor(() => {
        expect(revealEvents).toEqual([{ workspace: '/Users/demo/project', filePath: directoryPath }]);
      });
      expect(previewMocks.openPreview).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(WORKSPACE_REVEAL_FILE_EVENT, handleReveal);
    }
  });

  it('keeps remote links as browser anchors', () => {
    render(<MarkdownViewer content='[docs](https://aionui.com/docs)' />);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://aionui.com/docs');
  });

  it('continues rendering local image markdown inline', async () => {
    const filePath = '/Users/demo/Desktop/chart.jpg';
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockResolvedValue('data:image/jpeg;base64,abc123');

    render(<MarkdownViewer content={`![image](${filePath})`} file_path='/Users/demo/Desktop/test.md' />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'image' })).toHaveAttribute('src', 'data:image/jpeg;base64,abc123');
    });
    expect(previewMocks.openPreview).not.toHaveBeenCalled();
  });
});
