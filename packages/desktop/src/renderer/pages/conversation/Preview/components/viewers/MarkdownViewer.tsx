/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import LocalFileLink from '@/renderer/components/Markdown/LocalFileLink';
import { resolveLocalFileLinkReference } from '@/renderer/components/Markdown/markdownUtils';
import {
  splitMarkdownFrontmatter,
  transformMarkdownWikiLinks,
} from '@/renderer/components/Markdown/markdownPreprocess';
import { useTextSelection } from '@/renderer/hooks/ui/useTextSelection';
import { Collapse } from '@arco-design/web-react';
import 'katex/dist/katex.min.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import remarkBreaks from 'remark-breaks';
import { Streamdown, defaultRehypePlugins, defaultRemarkPlugins } from 'streamdown';
import MarkdownEditor from '../editors/MarkdownEditor';
import SelectionToolbar from '../renderers/SelectionToolbar';
import { useContainerScroll, useContainerScrollTarget } from '../../hooks/useScrollSyncHelpers';
import { useLocalFilePreview, useThemeDetection } from '../../hooks';
import { getMarkdownShikiThemes, getMermaidTheme } from '../../theme';
import { convertLatexDelimiters } from '@/renderer/utils/chat/latexDelimiters';

interface MarkdownPreviewProps {
  content: string; // Markdown 内容 / Markdown content
  viewMode?: 'source' | 'preview'; // 外部控制的视图模式 / External view mode
  onViewModeChange?: (mode: 'source' | 'preview') => void; // 视图模式改变回调（保留以兼容调用方，暂未使用）/ View mode change callback (kept for call-site compatibility, currently unused)
  onContentChange?: (content: string) => void; // 内容改变回调 / Content change callback
  containerRef?: React.RefObject<HTMLDivElement>; // 容器引用，用于滚动同步 / Container ref for scroll sync
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
  file_path?: string; // 当前 Markdown 文件的绝对路径 / Absolute file path of current markdown
  workspace?: string;
  targetLine?: number; // 原文模式定位行 / Source-mode line reveal
  targetColumn?: number; // 原文模式定位列 / Source-mode column reveal
  targetRevealKey?: string; // 重新触发行号定位 / Re-trigger line reveal
}

const isDataOrRemoteUrl = (value?: string): boolean => {
  if (!value) return false;
  return /^(https?:|data:|blob:|file:)/i.test(value);
};

const isAbsoluteLocalPath = (value?: string): boolean => {
  if (!value) return false;
  return /^([a-zA-Z]:\\|\\\\|\/)/.test(value);
};

interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  baseDir?: string;
  workspace?: string;
}

const useImageResolverCache = () => {
  const cacheRef = useRef(new Map<string, string>());
  const inflightRef = useRef(new Map<string, Promise<string>>());

  const resolve = useCallback((key: string, loader: () => Promise<string>): Promise<string> => {
    const cache = cacheRef.current;
    if (cache.has(key)) {
      return Promise.resolve(cache.get(key)!);
    }

    const inflight = inflightRef.current;
    if (inflight.has(key)) {
      return inflight.get(key)!;
    }

    const promise = loader()
      .then((result) => {
        cache.set(key, result);
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  }, []);

  return resolve;
};

const MarkdownImage: React.FC<MarkdownImageProps> = ({ src, alt, baseDir, workspace, ...props }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);
  const resolveImage = useImageResolverCache();

  useEffect(() => {
    let cancelled = false;

    const loadImage = () => {
      if (!src) {
        setResolvedSrc(undefined);
        return;
      }

      if (isDataOrRemoteUrl(src)) {
        if (/^https?:/i.test(src)) {
          resolveImage(src, () => ipcBridge.fs.fetchRemoteImage.invoke({ url: src }))
            .then((dataUrl) => {
              if (!cancelled) {
                setResolvedSrc(dataUrl);
              }
            })
            .catch((error) => {
              console.error('[MarkdownPreview] Failed to fetch remote image:', src, error);
              if (!cancelled) {
                setResolvedSrc(src);
              }
            });
          return;
        }
        setResolvedSrc(src);
        return;
      }

      const cleanedSrc = src.replace(/\\/g, '/');
      const localReference = resolveLocalFileLinkReference(cleanedSrc, undefined, {
        baseDir,
        allowedRootDir: workspace,
      });
      const absolutePath = localReference?.filePath ?? (isAbsoluteLocalPath(cleanedSrc) ? cleanedSrc : undefined);

      if (!absolutePath) {
        setResolvedSrc(src);
        return;
      }

      resolveImage(absolutePath, async () => {
        const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: absolutePath, workspace });
        return dataUrl ?? src;
      })
        .then((dataUrl) => {
          if (!cancelled) {
            setResolvedSrc(dataUrl);
          }
        })
        .catch((error) => {
          console.error('[MarkdownPreview] Failed to load local image:', { src, absolutePath, error });
          if (!cancelled) {
            setResolvedSrc(src);
          }
        });
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [src, baseDir, resolveImage, workspace]);

  if (!resolvedSrc) {
    return alt ? <span>{alt}</span> : null;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy='no-referrer'
      crossOrigin='anonymous'
      style={{ maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }}
      {...props}
    />
  );
};

const encodeHtmlAttribute = (value: string) => value.replace(/&(?!#?[a-z0-9]+;)/gi, '&amp;');

const rewriteExternalMediaUrls = (markdown: string): string => {
  const githubWikiRegex = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/wiki\/([^\s)"'>]+)/gi;
  const rewriteWiki = markdown.replace(githubWikiRegex, (_match, owner, repo, rest) => {
    return `https://raw.githubusercontent.com/wiki/${owner}/${repo}/${rest}`;
  });
  return rewriteWiki.replace(/<(img|a)\b[^>]*>/gi, (tag) => {
    return tag.replace(/(src|href)\s*=\s*(["'])([^"']*)(\2)/gi, (match, attr, quote, value, closingQuote) => {
      return `${attr}=${quote}${encodeHtmlAttribute(value)}${closingQuote}`;
    });
  });
};

const normalizeLocalFileSchemeLinks = (markdown: string): string => {
  return markdown.replace(/file:\/\//gi, '');
};

// Streamdown's built-in heading components are memoized by node position only
// (children are ignored), so headings keep stale text when content re-renders —
// especially with rehype-raw, which drops positions. Plain overrides keep the
// built-in classes but always render the current text.
const HEADING_COMPONENTS = Object.fromEntries(
  (
    [
      ['h1', 'text-3xl'],
      ['h2', 'text-2xl'],
      ['h3', 'text-xl'],
      ['h4', 'text-lg'],
      ['h5', 'text-base'],
      ['h6', 'text-sm'],
    ] as const
  ).map(([tag, size], index) => [
    tag,
    ({ children, className, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) =>
      React.createElement(
        tag,
        {
          className: ['mt-6 mb-2 font-semibold', size, className].filter(Boolean).join(' '),
          'data-streamdown': `heading-${index + 1}`,
          ...props,
        },
        children
      ),
  ])
);

/**
 * Markdown 预览组件
 * Markdown preview component
 *
 * 使用 Streamdown 原生渲染 Markdown（Shiki 代码高亮、Mermaid、KaTeX），支持原文/预览切换
 * Uses Streamdown native rendering (Shiki code highlight, Mermaid, KaTeX), supports source/preview toggle
 */
const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  viewMode: externalViewMode,
  onContentChange,
  containerRef: externalContainerRef,
  onScroll: externalOnScroll,
  file_path,
  workspace,
  targetLine,
  targetColumn,
  targetRevealKey,
}) => {
  const { t } = useTranslation();
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef; // 使用外部 ref 或内部 ref / Use external ref or internal ref
  const currentTheme = useThemeDetection();
  const handleLocalFileLink = useLocalFilePreview(workspace, { replace: false });

  // 使用滚动同步 Hooks / Use scroll sync hooks
  useContainerScroll(containerRef, externalOnScroll);
  useContainerScrollTarget(containerRef);

  // 使用外部传入的 viewMode，默认预览模式 / Use external viewMode if provided, default to preview
  const viewMode = externalViewMode ?? 'preview';

  // 预览源：转换 LaTeX 分隔符并重写外部媒体 URL / Preview source: convert LaTeX delimiters and rewrite external media URLs
  const previewSource = useMemo(
    () =>
      transformMarkdownWikiLinks(
        convertLatexDelimiters(normalizeLocalFileSchemeLinks(rewriteExternalMediaUrls(content)))
      ),
    [content]
  );

  const previewFrontmatter = useMemo(() => splitMarkdownFrontmatter(previewSource), [previewSource]);
  const renderedPreviewSource = previewFrontmatter?.body ?? previewSource;

  // 监听文本选择 / Monitor text selection
  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef);

  const baseDir = useMemo(() => {
    if (!file_path) return undefined;
    const normalized = file_path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) return undefined;
    return normalized.slice(0, lastSlash);
  }, [file_path]);

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {/* 内容区域 / Content area */}
      <div
        ref={containerRef}
        className={`flex-1 ${viewMode === 'source' ? 'overflow-hidden' : 'overflow-auto p-32px text-t-primary'}`}
        style={{ minWidth: 0 }}
      >
        {viewMode === 'source' ? (
          // 原文模式：使用编辑器 / Source mode: Use editor
          <MarkdownEditor
            value={content}
            onChange={(value) => onContentChange?.(value)}
            fileName={file_path}
            targetLine={targetLine}
            targetColumn={targetColumn}
            targetRevealKey={targetRevealKey}
          />
        ) : (
          // 预览模式：Streamdown 原生渲染 / Preview mode: native Streamdown
          <div
            className='aionui-markdown'
            style={{
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            {previewFrontmatter && (
              <Collapse bordered={false} className='mb-20px bg-fill-1 rd-6px' defaultActiveKey={[]}>
                <Collapse.Item
                  name='frontmatter'
                  header={<span className='text-13px text-t-secondary'>{t('preview.frontmatterMetadata')}</span>}
                >
                  <pre className='mt-0 mb-0 overflow-auto text-12px leading-18px'>
                    <code>{previewFrontmatter.metadata}</code>
                  </pre>
                </Collapse.Item>
              </Collapse>
            )}
            <Streamdown
              mode='static'
              shikiTheme={getMarkdownShikiThemes()}
              mermaid={{ config: { theme: getMermaidTheme(currentTheme) } }}
              controls={{ table: false, mermaid: false }}
              remarkPlugins={[...Object.values(defaultRemarkPlugins), remarkBreaks]}
              rehypePlugins={[defaultRehypePlugins.raw, defaultRehypePlugins.sanitize, defaultRehypePlugins.katex]}
              components={{
                ...HEADING_COMPONENTS,
                a({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
                  const localFileReference = resolveLocalFileLinkReference(
                    typeof href === 'string' ? href : '',
                    undefined,
                    { baseDir, allowedRootDir: workspace }
                  );
                  if (localFileReference) {
                    return (
                      <LocalFileLink reference={localFileReference} onOpen={handleLocalFileLink}>
                        {children}
                      </LocalFileLink>
                    );
                  }
                  return (
                    <a href={href} target='_blank' rel='noreferrer' {...props}>
                      {children}
                    </a>
                  );
                },
                img({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
                  return <MarkdownImage src={src} alt={alt} baseDir={baseDir} workspace={workspace} {...props} />;
                },
              }}
            >
              {renderedPreviewSource}
            </Streamdown>
          </div>
        )}
      </div>

      {/* 文本选择浮动工具栏 / Text selection floating toolbar */}
      {selectedText && (
        <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />
      )}
    </div>
  );
};

export default MarkdownPreview;
