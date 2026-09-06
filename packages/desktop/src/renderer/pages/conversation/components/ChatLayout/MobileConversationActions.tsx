import ConversationTitleMinimap from '@/renderer/pages/conversation/components/ConversationTitleMinimap';
import React from 'react';
import { createPortal } from 'react-dom';

type MobileConversationActionsProps = {
  actionsSlot: HTMLElement | null;
  conversationId?: string;
  children?: React.ReactNode;
};

const MobileConversationActions: React.FC<MobileConversationActionsProps> = ({
  actionsSlot,
  conversationId,
  children,
}) => {
  if (!actionsSlot) return null;

  return createPortal(
    <>
      {conversationId && <ConversationTitleMinimap conversation_id={conversationId} mobileTitlebar />}
      {children}
    </>,
    actionsSlot
  );
};

export default MobileConversationActions;
