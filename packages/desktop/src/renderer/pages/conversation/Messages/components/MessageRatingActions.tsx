/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Input, InputNumber, Message, Modal, Tooltip } from '@arco-design/web-react';
import { Dislike, Like } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type MessageRatingVote = 'up' | 'down';

export type MessageRatingContext = {
  conversationId: string;
  questionMessageId: string;
  questionSnapshot: string;
  answerSnapshot: string;
};

type ConversationRatingResponse = {
  id: string;
  vote: MessageRatingVote;
  score: number;
  comment?: string;
};

const DEFAULT_SCORE: Record<MessageRatingVote, number> = {
  up: 8,
  down: 4,
};

const SCORE_RANGE: Record<MessageRatingVote, { min: number; max: number }> = {
  up: { min: 6, max: 10 },
  down: { min: 0, max: 5 },
};

const clampScore = (vote: MessageRatingVote, score: number): number => {
  const range = SCORE_RANGE[vote];
  return Math.max(range.min, Math.min(range.max, score));
};

const MessageRatingActions: React.FC<{
  answerMessageId: string;
  context: MessageRatingContext;
}> = ({ answerMessageId, context }) => {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [vote, setVote] = useState<MessageRatingVote>('up');
  const [score, setScore] = useState(DEFAULT_SCORE.up);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedVote, setSubmittedVote] = useState<MessageRatingVote | undefined>();

  const range = SCORE_RANGE[vote];
  const openModal = useCallback((nextVote: MessageRatingVote) => {
    setVote(nextVote);
    setScore((current) => clampScore(nextVote, current || DEFAULT_SCORE[nextVote]));
    setModalVisible(true);
  }, []);

  const title = useMemo(
    () =>
      vote === 'up'
        ? t('messages.rating.likeTitle', { defaultValue: 'Rate this answer' })
        : t('messages.rating.dislikeTitle', { defaultValue: 'Rate this answer' }),
    [t, vote]
  );

  const handleSubmit = useCallback(async () => {
    const normalizedScore = clampScore(vote, score || DEFAULT_SCORE[vote]);
    setSubmitting(true);
    try {
      const result = await httpRequest<ConversationRatingResponse>(
        'POST',
        `/api/conversations/${encodeURIComponent(context.conversationId)}/ratings/${encodeURIComponent(answerMessageId)}`,
        {
          question_message_id: context.questionMessageId,
          vote,
          score: normalizedScore,
          comment: comment.trim() || null,
          question_snapshot: context.questionSnapshot,
          answer_snapshot: context.answerSnapshot,
        }
      );
      setSubmittedVote(result.vote);
      setScore(result.score);
      setComment(result.comment ?? '');
      setModalVisible(false);
      Message.success(t('messages.rating.submitSuccess', { defaultValue: 'Rating submitted' }));
    } catch {
      Message.error(t('messages.rating.submitFailed', { defaultValue: 'Failed to submit rating' }));
    } finally {
      setSubmitting(false);
    }
  }, [answerMessageId, comment, context, score, t, vote]);

  return (
    <>
      <Tooltip content={t('messages.rating.like', { defaultValue: 'Like' })}>
        <Button
          aria-label={t('messages.rating.like', { defaultValue: 'Like' })}
          className='message-meta-rating-button rd-4px transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
          icon={<Like theme={submittedVote === 'up' ? 'filled' : 'outline'} size='16' fill={iconColors.secondary} />}
          onClick={() => openModal('up')}
          size='mini'
          style={{ lineHeight: 0 }}
          type='text'
        />
      </Tooltip>
      <Tooltip content={t('messages.rating.dislike', { defaultValue: 'Dislike' })}>
        <Button
          aria-label={t('messages.rating.dislike', { defaultValue: 'Dislike' })}
          className='message-meta-rating-button rd-4px transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
          icon={
            <Dislike theme={submittedVote === 'down' ? 'filled' : 'outline'} size='16' fill={iconColors.secondary} />
          }
          onClick={() => openModal('down')}
          size='mini'
          style={{ lineHeight: 0 }}
          type='text'
        />
      </Tooltip>
      <Modal
        title={title}
        visible={modalVisible}
        confirmLoading={submitting}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        okText={t('common.confirm', { defaultValue: 'Confirm' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      >
        <div className='flex flex-col gap-16px'>
          <div>
            <div className='text-13px text-t-secondary mb-6px'>{t('messages.rating.score')}</div>
            <InputNumber
              min={range.min}
              max={range.max}
              value={score}
              onChange={(value) => setScore(clampScore(vote, typeof value === 'number' ? value : DEFAULT_SCORE[vote]))}
              style={{ width: 120 }}
            />
          </div>
          <div>
            <div className='text-13px text-t-secondary mb-6px'>{t('messages.rating.comment')}</div>
            <Input.TextArea
              value={comment}
              onChange={setComment}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={t('messages.rating.commentPlaceholder')}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default MessageRatingActions;
