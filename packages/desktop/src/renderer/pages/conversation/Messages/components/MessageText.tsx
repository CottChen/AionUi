/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Message, Modal, Tooltip } from '@arco-design/web-react';
import { getContentTypeByExtension } from '../../Preview/fileUtils';
import { textExts } from '@/renderer/services/FileService';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { Copy } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/ui/clipboard';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import FilePreview from '@renderer/components/media/FilePreview';
import HorizontalFileList from '@renderer/components/media/HorizontalFileList';
import MarkdownView from '@renderer/components/Markdown';
import { stripThinkTags, hasThinkTags } from '@renderer/utils/chat/thinkTagFilter';
import { buildTurnClipboardText } from '@renderer/utils/chat/turnCopy';
import { stripSkillSuggest, hasSkillSuggest } from '@renderer/utils/chat/skillSuggestParser';
import { isForkEnabled } from '@/common/chat/forkConversation';
import { useForkConversation } from '@/renderer/hooks/chat/useForkConversation';
import ForkBranchIcon from '@renderer/components/base/ForkBranchIcon';

/**
 * Format a timestamp for message display.
 * Today: "HH:mm", older: "MM-DD HH:mm".
 */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (
    date.getFullYear() !== now.getFullYear() ||
    date.getMonth() !== now.getMonth() ||
    date.getDate() !== now.getDate()
  ) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day} ${time}`;
  }
  return time;
};
import MessageCronBadge from './MessageCronBadge';
import MessageRatingActions, { type MessageRatingContext } from './MessageRatingActions';
import { resolveAgentLogo, useAgentLogos } from '@/renderer/utils/model/agentLogo';
import TeammateMessageAvatar from './TeammateMessageAvatar';
import { useTeammateColor } from '@/renderer/pages/team/identity/TeamIdentityContext';

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };

type ParsedFileMarker = {
  text: string;
  files: string[];
};

type ChannelSendPayload = {
  type: 'image' | 'file';
  path: string;
  caption?: string;
};

type ParsedChannelSend = {
  text: string;
  files: string[];
};

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const MARKDOWN_ATTACHMENT_LINE_PATTERN = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|)/;
const CHANNEL_SEND_BLOCK_PATTERN =
  /^[ \t]*\[AIONUI_CHANNEL_SEND\][ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\[\/AIONUI_CHANNEL_SEND\][ \t]*$/gm;

const parseFileMarker = (content: string, canParseFileMarker: boolean): ParsedFileMarker => {
  if (!canParseFileMarker) {
    return { text: content, files: [] };
  }

  const lines = content.split(/\r?\n/);
  let markerLineIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === AIONUI_FILES_MARKER) {
      markerLineIndex = index;
      break;
    }
  }

  if (markerLineIndex === -1) {
    return { text: content, files: [] };
  }

  const files = lines
    .slice(markerLineIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!files.length || files.some((file_path) => !isLocalMessageFilePath(file_path))) {
    return { text: content, files: [] };
  }

  return {
    text: lines.slice(0, markerLineIndex).join('\n').trimEnd(),
    files,
  };
};

const isAbsoluteMessageFilePath = (file_path: string): boolean =>
  file_path.startsWith('/') || file_path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(file_path);

const isWorkspaceRelativeMessageFilePath = (file_path: string): boolean => {
  const normalizedFilePath = file_path.replace(/\\/g, '/');
  return (
    normalizedFilePath.startsWith('./') ||
    normalizedFilePath.startsWith('../') ||
    normalizedFilePath.includes('/') ||
    /(?:^|\/)[^/]+\.[^./\s][^/]*$/.test(normalizedFilePath)
  );
};

const isLocalMessageFilePath = (file_path: string): boolean => {
  const trimmedFilePath = file_path.trim();
  if (
    !trimmedFilePath ||
    URL_SCHEME_PATTERN.test(trimmedFilePath) ||
    MARKDOWN_ATTACHMENT_LINE_PATTERN.test(trimmedFilePath)
  ) {
    return false;
  }

  return isAbsoluteMessageFilePath(trimmedFilePath) || isWorkspaceRelativeMessageFilePath(trimmedFilePath);
};

const escapeMarkdownImageAlt = (value: string): string =>
  value.replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');

const escapeMarkdownDestination = (value: string): string => value.replace(/</g, '%3C').replace(/>/g, '%3E');

const isInsideMarkdownFence = (content: string, offset: number): boolean => {
  let activeFence: '`' | '~' | undefined;
  for (const line of content.slice(0, offset).split(/\r?\n/)) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    const marker = match[1][0] as '`' | '~';
    activeFence = activeFence === marker ? undefined : activeFence || marker;
  }
  return activeFence !== undefined;
};

export const parseChannelSendBlocks = (content: string, canParseChannelSend: boolean): ParsedChannelSend => {
  if (!canParseChannelSend) {
    return { text: content, files: [] };
  }

  const files: string[] = [];
  const text = content.replace(CHANNEL_SEND_BLOCK_PATTERN, (block, rawPayload: string, offset: number) => {
    if (isInsideMarkdownFence(content, offset)) return block;

    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload.trim());
    } catch {
      return block;
    }

    if (!payload || typeof payload !== 'object') return block;
    const candidate = payload as Partial<ChannelSendPayload>;
    if (
      (candidate.type !== 'image' && candidate.type !== 'file') ||
      typeof candidate.path !== 'string' ||
      !isLocalMessageFilePath(candidate.path)
    ) {
      return block;
    }

    const path = candidate.path.trim();
    if (candidate.type === 'file') {
      files.push(path);
      return '';
    }

    const fallbackAlt = path.split(/[\\/]/).pop() || 'image';
    const caption =
      typeof candidate.caption === 'string' && candidate.caption.trim() ? candidate.caption.trim() : fallbackAlt;
    return `\n\n![${escapeMarkdownImageAlt(caption)}](<${escapeMarkdownDestination(path)}>)\n\n`;
  });

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), files };
};

export const resolveMessageFilePath = (file_path: string, workspace?: string): string => {
  if (!file_path || isAbsoluteMessageFilePath(file_path) || !workspace) {
    return file_path;
  }

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedFilePath = file_path.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, '/');
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageText: React.FC<{
  message: IMessageText;
  showCopyButton?: boolean;
  showTimestamp?: boolean;
  ratingContext?: MessageRatingContext;
  isLastMessage?: boolean;
  hasForkAnchor?: boolean;
  /** All text segments of this message's turn, in order. */
  turnTexts?: string[];
}> = ({
  message,
  showCopyButton = true,
  showTimestamp = true,
  ratingContext,
  isLastMessage = false,
  hasForkAnchor = false,
  turnTexts,
}) => {
  const logos = useAgentLogos();
  // Filter think tags from content before rendering
  // 在渲染前过滤 think 标签
  const contentToRender = useMemo(() => {
    let content = message.content.content;
    if (typeof content === 'string') {
      if (hasThinkTags(content)) {
        content = stripThinkTags(content);
      }
      // Strip any inline [SKILL_SUGGEST] blocks (now handled via separate skill_suggest message type)
      if (hasSkillSuggest(content)) {
        content = stripSkillSuggest(content);
      }
      return content;
    }
    return content;
  }, [message.content.content]);

  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const isUserMessage = message.position === 'right';
  const isTeammateMessage = message.position === 'left' && message.content.teammateMessage === true;
  const { text, files } = useMemo(() => {
    const channelSend = parseChannelSendBlocks(contentToRender, !isUserMessage);
    const fileMarker = parseFileMarker(channelSend.text, isUserMessage);
    return { text: fileMarker.text, files: [...fileMarker.files, ...channelSend.files] };
  }, [contentToRender, isUserMessage]);
  const { data, json } = useFormatContent(text);
  const shouldRenderPlainText = isUserMessage;
  const conversationContext = useConversationContextSafe();
  const { user } = useAuth();
  const forkConversation = useForkConversation(conversationContext?.conversation_id);
  const previewLocalFile = useLocalFilePreview(conversationContext?.workspace);
  const [fileAction, setFileAction] = useState<Parameters<typeof previewLocalFile> | null>(null);
  const handleLocalFileLink: typeof previewLocalFile = async (path, reference) => {
    const type = getContentTypeByExtension(path);
    const extension = path
      .split(/[\\/]/)
      .pop()
      ?.match(/\.[^.]+$/)?.[0]
      .toLowerCase();
    if (type === 'markdown' || (type === 'code' && (!extension || textExts.includes(extension)))) {
      await previewLocalFile(path, reference);
    } else {
      setFileAction([path, reference]);
    }
  };
  const resolvedFiles = useMemo(
    () => files.map((file_path) => resolveMessageFilePath(file_path, conversationContext?.workspace)),
    [conversationContext?.workspace, files]
  );

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const baseText = shouldRenderPlainText ? text : json ? JSON.stringify(data, null, 2) : text;
    const fileList = files.length ? `Files:\n${files.map((path) => `- ${path}`).join('\n')}\n\n` : '';
    // An AI turn split by tool calls / thinking stores several text messages;
    // the row sits on the last one but must copy the whole reply.
    const textToCopy = turnTexts?.length ? buildTurnClipboardText(turnTexts) : fileList + baseText;
    copyText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  const copyButton = (
    <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
      <Button
        aria-label={t('common.copy', { defaultValue: 'Copy' })}
        className='message-meta-copy-button rd-4px transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        icon={<Copy theme='outline' size='16' fill={iconColors.secondary} />}
        onClick={handleCopy}
        size='mini'
        style={{ lineHeight: 0 }}
        type='text'
      />
    </Tooltip>
  );

  // Fork entry point: only when the agent declares the capability, and only on
  // messages the backend can actually fork at (any message for at_turn/codex,
  // the last message otherwise) — see `isForkEnabled`.
  const canForkConversation = isElectronDesktop() || user?.isAdmin === true;
  const showForkButton =
    canForkConversation &&
    isForkEnabled(conversationContext?.forkCapability, {
      isLastMessage,
      hasTurnAnchor: hasForkAnchor,
    });
  const forkButton = showForkButton ? (
    <Tooltip content={t('messages.fork.action')}>
      <div
        className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        onClick={() => void forkConversation(message.msg_id ?? message.id)}
        style={{ lineHeight: 0 }}
        data-testid='message-fork-button'
      >
        <ForkBranchIcon size={16} fill={iconColors.secondary} />
      </div>
    </Tooltip>
  ) : null;

  const cronMeta = message.content.cronMeta;
  const senderName = message.content.senderName;
  const senderAgentType = message.content.senderAgentType;
  const senderConversationId = message.content.senderConversationId;
  const fallbackBackendLogo = senderAgentType ? resolveAgentLogo(logos, { backend: senderAgentType }) : null;
  // 团队 teammate 消息：按发送者会话取身份色，做气泡左色条 + 彩色发送者名；非团队场景为 undefined。
  const teammateColor = useTeammateColor(isTeammateMessage ? senderConversationId : undefined);

  return (
    <>
      <Modal
        visible={fileAction !== null}
        title={fileAction?.[0].split(/[\\/]/).pop()}
        onCancel={() => setFileAction(null)}
        footer={
          <div className='flex gap-8px justify-end'>
            <Button
              type='primary'
              onClick={() => {
                if (!fileAction) return;
                const target = fileAction;
                setFileAction(null);
                void previewLocalFile(...target);
              }}
            >
              {t('preview.preview')}
            </Button>
            <Button
              onClick={() => {
                if (!fileAction) return;
                const path = fileAction[0];
                setFileAction(null);
                void downloadFileFromPath(
                  path,
                  path.split(/[\\/]/).pop() || path,
                  conversationContext?.workspace
                ).catch(() => Message.error(t('common.failed')));
              }}
            >
              {t('common.download')}
            </Button>
          </div>
        }
      />
      <div className={classNames('min-w-0 flex flex-col group', isUserMessage ? 'items-end' : 'items-start')}>
        {cronMeta && <MessageCronBadge meta={cronMeta} />}
        {isTeammateMessage && senderName && (
          <div className='flex items-center gap-6px mb-4px'>
            <TeammateMessageAvatar
              senderName={senderName}
              senderConversationId={senderConversationId}
              backendLogo={fallbackBackendLogo}
            />
            <span
              className='text-12px'
              style={teammateColor ? { color: teammateColor } : { color: 'var(--text-secondary)' }}
            >
              {senderName}
            </span>
          </div>
        )}
        {files.length > 0 && (
          <div className={classNames('mt-6px min-w-0 max-w-full', { 'self-end': isUserMessage })}>
            {resolvedFiles.length === 1 ? (
              <div className='flex items-center'>
                <FilePreview
                  path={resolvedFiles[0]}
                  onRemove={() => undefined}
                  readonly
                  onOpen={() => void handleLocalFileLink(resolvedFiles[0])}
                />
              </div>
            ) : (
              <HorizontalFileList>
                {resolvedFiles.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => undefined}
                    readonly
                    onOpen={() => void handleLocalFileLink(path)}
                  />
                ))}
              </HorizontalFileList>
            )}
          </div>
        )}
        <div
          className={classNames('min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px', {
            'bg-aou-2 p-6px md:p-8px': isUserMessage || cronMeta,
            'bg-3 p-6px md:p-8px': isTeammateMessage,
            'w-full': !(isUserMessage || cronMeta || isTeammateMessage),
          })}
          style={{
            ...(isUserMessage || cronMeta
              ? { borderRadius: '8px 0 8px 8px', color: 'var(--text-primary)' }
              : isTeammateMessage
                ? {
                    borderRadius: '0 8px 8px 8px',
                    ...(teammateColor ? { borderLeft: `3px solid ${teammateColor}` } : {}),
                  }
                : undefined),
          }}
        >
          {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
          {shouldRenderPlainText ? (
            <div className='whitespace-pre-wrap [overflow-wrap:anywhere]' data-testid='message-text-content'>
              {text}
            </div>
          ) : json ? (
            <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
              <div data-testid='message-text-content'>
                <MarkdownView
                  codeStyle={CODE_STYLE}
                  localFileBaseDir={conversationContext?.workspace}
                  onLocalFileLink={handleLocalFileLink}
                >{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
              </div>
            </CollapsibleContent>
          ) : (
            <div data-testid='message-text-content'>
              <MarkdownView
                codeStyle={CODE_STYLE}
                localFileBaseDir={conversationContext?.workspace}
                onLocalFileLink={handleLocalFileLink}
              >
                {data}
              </MarkdownView>
            </div>
          )}
        </div>
        {/* Desktop keeps hover-revealed metadata; touch/no-hover devices show it via CSS.
            For AI replies split across several text messages, only the last text
            of the turn shows the copy button; user messages always do. */}
        {(showCopyButton || showTimestamp || ratingContext || forkButton) && (
          <div
            className={classNames('h-32px flex items-center mt-4px gap-8px', {
              'flex-row-reverse': isUserMessage,
            })}
          >
            {showCopyButton && copyButton}
            {ratingContext && <MessageRatingActions answerMessageId={message.id} context={ratingContext} />}
            {forkButton}
            {showTimestamp && message.created_at && (
              <span className='message-meta-time text-12px text-t-secondary opacity-0 group-hover:opacity-100 transition-opacity select-none'>
                {formatMessageTime(message.created_at)}
              </span>
            )}
          </div>
        )}
      </div>
      {showCopyAlert && (
        <Alert
          type='success'
          content={t('messages.copySuccess')}
          showIcon
          className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]'
          style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }}
          closable={false}
        />
      )}
    </>
  );
};

export default MessageText;
